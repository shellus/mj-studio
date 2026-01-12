/**
 * chat 工具实现
 */
import type { AuthUser } from '../../../../app/shared/types'
import { db } from '../../../database'
import { conversations, messages, assistants } from '../../../database/schema'
import { useConversationService } from '../../conversation'
import { useAssistantService } from '../../assistant'
import { useAimodelService } from '../../aimodel'
import { useUpstreamService } from '../../upstream'
import { getChatProvider } from '../../chatProviders'
import type { ChatApiFormat } from '../../chatProviders'
import { startStreamingTask } from '../../streamingTask'
import { eq, and } from 'drizzle-orm'

export async function chat(
  user: AuthUser,
  assistantId: number,
  message: string,
  conversationId?: number,
  title?: string,
  stream?: boolean,
) {
  // 验证助手属于用户
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(assistantId)

  if (!assistant || assistant.userId !== user.id) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '助手不存在' }) }],
      isError: true,
    }
  }

  // 检查助手是否配置了模型
  if (!assistant.aimodelId) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '助手未配置模型' }) }],
      isError: true,
    }
  }

  const conversationService = useConversationService()
  const aimodelService = useAimodelService()
  const upstreamService = useUpstreamService()

  // 获取模型信息
  const aimodel = await aimodelService.getByIdWithUpstream(assistant.aimodelId)
  if (!aimodel) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '模型配置无效' }) }],
      isError: true,
    }
  }

  // 获取上游配置
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '上游配置无效' }) }],
      isError: true,
    }
  }

  let actualConversationId = conversationId

  // 如果没有提供对话 ID，创建新对话
  if (!actualConversationId) {
    const newConversation = await conversationService.create({
      userId: user.id,
      assistantId,
      title: title || conversationService.generateTitle(message),
    })
    actualConversationId = newConversation.id

    // 更新助手对话计数
    await assistantService.refreshConversationCount(assistantId)
  } else {
    // 验证对话属于用户
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, actualConversationId),
        eq(conversations.userId, user.id),
      ),
    })

    if (!conversation) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: '对话不存在' }) }],
        isError: true,
      }
    }
  }

  // 获取历史消息
  const result = await conversationService.getWithMessages(actualConversationId)
  const historyMessages = result?.messages || []

  // 创建用户消息
  const userMessage = await conversationService.addMessage(user.id, {
    conversationId: actualConversationId,
    role: 'user',
    content: message.trim(),
  })

  // 获取模型显示名称
  const modelDisplayName = `${aimodel.upstreamName} / ${aimodel.name}`

  // 创建 AI 消息
  const assistantMessage = await conversationService.addMessage(user.id, {
    conversationId: actualConversationId,
    role: 'assistant',
    content: '',
    modelDisplayName,
    status: 'created',
  })

  // 流式模式：返回 messageId，让客户端订阅
  if (stream) {
    // 启动流式生成任务
    setImmediate(() => {
      startStreamingTask({
        messageId: assistantMessage.id,
        userMessageId: userMessage.id,
        conversationId: actualConversationId!,
        userId: user.id,
        userContent: message.trim(),
        isCompressRequest: false,
      }).catch(err => {
        console.error('MCP 流式生成任务失败:', err)
      })
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        conversationId: actualConversationId,
        messageId: assistantMessage.id,
        stream: true,
        estimatedTime: aimodel.estimatedTime,
      }) }],
    }
  }

  // 非流式模式：等待完整响应
  const apiFormat = aimodel.apiFormat as ChatApiFormat
  const chatProvider = getChatProvider(apiFormat)
  if (!chatProvider) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: `不支持的聊天 API 格式: ${apiFormat}` }) }],
      isError: true,
    }
  }
  const chatService = chatProvider.createService(upstream, aimodel.keyName)

  try {
    const response = await chatService.chat(
      aimodel.modelName,
      assistant.systemPrompt,
      historyMessages,
      message.trim(),
    )

    if (!response.success) {
      // 更新消息内容和状态为失败
      await conversationService.updateMessageContentAndStatus(assistantMessage.id, response.error || '生成失败', 'failed')

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: response.error }) }],
        isError: true,
      }
    }

    // 更新消息内容和状态
    await conversationService.updateMessageContentAndStatus(assistantMessage.id, response.content || '', 'completed')

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        conversationId: actualConversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: response.content,
        },
      }) }],
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'

    // 更新消息内容和状态为失败
    await conversationService.updateMessageContentAndStatus(assistantMessage.id, errorMsg, 'failed')

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: errorMsg }) }],
      isError: true,
    }
  }
}

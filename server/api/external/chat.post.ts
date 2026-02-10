/**
 * POST /api/external/chat - HTTP API 对话接口
 *
 * 参数与 MCP chat 工具一致，额外支持可选的 aimodelId 覆盖助手默认模型
 *
 * 响应格式：
 * - 成功：HTTP 200 + { "status": "ok", "data": {...} }
 * - 失败：HTTP 400/401/404/502 + { "status": "error", "error": "..." }
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { useAssistantService } from '../../services/assistant'
import { useAimodelService } from '../../services/aimodel'
import { useUpstreamService } from '../../services/upstream'
import { useConversationService } from '../../services/conversation'
import { getChatProvider } from '../../services/chatProviders'
import type { ChatApiFormat } from '../../services/chatProviders'
import { startStreamingTask } from '../../services/streamingTask'
import { db } from '../../database'
import { conversations } from '../../database/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)
    const body = await readBody(event)

    const { assistantId, message, conversationId, title, stream, aimodelId } = body as {
      assistantId: number
      message: string
      conversationId?: number
      title?: string
      stream?: boolean
      aimodelId?: number
    }

    // 参数验证
    if (!assistantId) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '请指定助手 ID' }
    }
    if (!message?.trim()) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '消息内容不能为空' }
    }

    // 验证助手属于用户
    const assistantService = useAssistantService()
    const assistant = await assistantService.getById(assistantId)
    if (!assistant || assistant.userId !== user.id) {
      setResponseStatus(event, 404)
      return { status: 'error', error: '助手不存在' }
    }

    // 确定使用的模型 ID：优先使用一次性 aimodelId，否则用助手默认
    const effectiveAimodelId = aimodelId || assistant.aimodelId
    if (!effectiveAimodelId) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '助手未配置模型，且未指定 aimodelId' }
    }

    const aimodelService = useAimodelService()
    const upstreamService = useUpstreamService()
    const conversationService = useConversationService()

    // 获取模型信息
    const aimodel = await aimodelService.getByIdWithUpstream(effectiveAimodelId)
    if (!aimodel) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '模型配置无效' }
    }

    // 验证上游配置
    const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
    if (!upstream) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '上游配置无效' }
    }

    // 对话管理
    let actualConversationId = conversationId

    if (!actualConversationId) {
      // 创建新对话
      const newConversation = await conversationService.create({
        userId: user.id,
        assistantId,
        title: title || conversationService.generateTitle(message),
      })
      actualConversationId = newConversation.id
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
        setResponseStatus(event, 404)
        return { status: 'error', error: '对话不存在' }
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

    // 创建 AI 消息
    const modelDisplayName = `${aimodel.upstreamName} / ${aimodel.name}`
    const assistantMessage = await conversationService.addMessage(user.id, {
      conversationId: actualConversationId,
      role: 'assistant',
      content: '',
      modelDisplayName,
      status: 'created',
    })

    // 流式模式
    if (stream) {
      setImmediate(() => {
        startStreamingTask({
          messageId: assistantMessage.id,
          userMessageId: userMessage.id,
          conversationId: actualConversationId!,
          userId: user.id,
          userContent: message.trim(),
          isCompressRequest: false,
        }).catch(err => {
          console.error('HTTP API 流式生成任务失败:', err)
        })
      })

      return {
        status: 'ok',
        data: {
          conversationId: actualConversationId,
          messageId: assistantMessage.id,
          stream: true,
          estimatedTime: aimodel.estimatedTime,
        },
      }
    }

    // 非流式模式：等待完整响应
    const apiFormat = aimodel.apiFormat as ChatApiFormat
    const chatProvider = getChatProvider(apiFormat)
    if (!chatProvider) {
      setResponseStatus(event, 500)
      return { status: 'error', error: `不支持的聊天 API 格式: ${apiFormat}` }
    }
    const chatService = chatProvider.createService(upstream, aimodel.keyName)

    const response = await chatService.chat(
      aimodel.modelName,
      assistant.systemPrompt,
      historyMessages,
      message.trim(),
    )

    if (!response.success) {
      await conversationService.updateMessageContentAndStatus(assistantMessage.id, response.error || '生成失败', 'failed')
      setResponseStatus(event, 502)
      return { status: 'error', error: response.error || '生成失败' }
    }

    await conversationService.updateMessageContentAndStatus(assistantMessage.id, response.content || '', 'completed')

    return {
      status: 'ok',
      data: {
        conversationId: actualConversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: response.content,
        },
      },
    }
  } catch (error) {
    // 统一错误处理
    console.error('HTTP API 对话接口错误:', error)

    // 如果是认证错误，返回 401
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const err = error as { statusCode: number; message: string }
      setResponseStatus(event, err.statusCode)
      return { status: 'error', error: err.message }
    }

    // 其他未知错误，返回 500
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    setResponseStatus(event, 500)
    return { status: 'error', error: errorMsg }
  }
})

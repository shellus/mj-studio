// POST /api/conversations/[id]/compress - 压缩对话
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService } from '../../../services/chat'
import { db } from '../../../database'
import { messages as messagesTable } from '../../../database/schema'
import { eq, and, lt, gt } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '对话ID不能为空' })
  }

  const conversationId = parseInt(id, 10)
  if (isNaN(conversationId)) {
    throw createError({ statusCode: 400, message: '无效的对话ID' })
  }

  // 获取对话和消息
  const conversationService = useConversationService()
  const result = await conversationService.getWithMessages(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  const { messages } = result

  if (messages.length < 3) {
    throw createError({ statusCode: 400, message: '对话消息太少，无需压缩' })
  }

  // 找到最后一个 summary 消息的位置
  let summaryIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].mark === 'summary') {
      summaryIndex = i
      break
    }
  }

  // 需要压缩的消息（从 summary 后开始，或从头开始）
  const startIndex = summaryIndex >= 0 ? summaryIndex + 1 : 0
  const messagesToCompress = messages.slice(startIndex, -2) // 保留最后2条

  if (messagesToCompress.length < 2) {
    throw createError({ statusCode: 400, message: '可压缩的消息太少' })
  }

  // 获取助手
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(result.conversation.assistantId)

  if (!assistant || !assistant.modelConfigId || !assistant.modelName) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
  }

  // 获取模型配置
  const modelConfigService = useModelConfigService()
  const modelConfig = await modelConfigService.getById(assistant.modelConfigId)

  if (!modelConfig) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 构建压缩提示词
  const conversationText = messagesToCompress.map(msg => {
    const role = msg.role === 'user' ? '用户' : 'AI'
    return `${role}: ${msg.content}`
  }).join('\n\n')

  const prompt = `请将以下对话内容压缩为一份详细的摘要（约500-1000字），需要保留：
1. 讨论的主要话题和结论
2. 重要的技术细节、代码片段或配置信息
3. 用户的关键需求和偏好
4. 待解决的问题或后续任务

直接输出摘要内容，不要加标题或格式说明：

${conversationText}`

  // 调用 AI 生成摘要
  const chatService = createChatService(modelConfig)

  try {
    const response = await chatService.chat(
      assistant.modelName,
      '你是一个对话摘要助手，擅长将长对话压缩为保留关键信息的摘要。',
      [],
      prompt
    )

    if (!response.success || !response.content) {
      throw new Error(response.error || '生成摘要失败')
    }

    const summary = response.content.trim()

    // 计算压缩前后的大小
    const originalSize = messagesToCompress.reduce((sum, msg) => {
      return sum + new TextEncoder().encode(msg.content).length
    }, 0)
    const compressedSize = new TextEncoder().encode(summary).length

    // 删除被压缩的消息
    const idsToDelete = messagesToCompress.map(m => m.id)
    for (const msgId of idsToDelete) {
      await db.delete(messagesTable)
        .where(eq(messagesTable.id, msgId))
    }

    // 添加摘要消息
    const summaryMessage = await conversationService.addMessage({
      conversationId,
      role: 'assistant',
      content: summary,
      modelConfigId: assistant.modelConfigId,
      modelName: assistant.modelName,
      mark: 'summary',
    })

    return {
      success: true,
      summary: summaryMessage,
      stats: {
        messagesCompressed: messagesToCompress.length,
        originalSize,
        compressedSize,
        compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%',
      },
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || '压缩失败',
    })
  }
})

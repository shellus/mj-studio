// POST /api/conversations/[id]/messages - 发送消息（流式响应）
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService, writeStreamToResponse } from '../../../services/chat'

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

  const body = await readBody(event)
  const { content, stream = true } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, message: '消息内容不能为空' })
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

  // 获取助手
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(result.conversation.assistantId)

  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  // 获取模型配置
  if (!assistant.modelConfigId || !assistant.modelName) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
  }

  const modelConfigService = useModelConfigService()
  const modelConfig = await modelConfigService.getById(assistant.modelConfigId)

  if (!modelConfig) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 保存用户消息
  const userMessage = await conversationService.addMessage({
    conversationId,
    role: 'user',
    content: content.trim(),
  })

  // 如果是首条消息，更新对话标题
  if (result.messages.length === 0) {
    const title = conversationService.generateTitle(content.trim())
    await conversationService.updateTitle(conversationId, user.id, title)
  }

  // 创建聊天服务
  const chatService = createChatService(modelConfig)

  if (stream) {
    // 流式响应
    setHeader(event, 'Content-Type', 'text/event-stream')
    setHeader(event, 'Cache-Control', 'no-cache')
    setHeader(event, 'Connection', 'keep-alive')

    try {
      const generator = chatService.chatStream(
        assistant.modelName,
        assistant.systemPrompt,
        result.messages,
        content.trim()
      )

      const fullContent = await writeStreamToResponse(event, generator)

      // 保存助手消息
      if (fullContent) {
        await conversationService.addMessage({
          conversationId,
          role: 'assistant',
          content: fullContent,
          modelConfigId: assistant.modelConfigId,
          modelName: assistant.modelName,
        })
      }

      return
    } catch (error: any) {
      // 发送错误
      const errorData = JSON.stringify({ error: error.message || '生成失败', done: true })
      event.node.res.write(`data: ${errorData}\n\n`)
      return
    }
  } else {
    // 非流式响应
    const response = await chatService.chat(
      assistant.modelName,
      assistant.systemPrompt,
      result.messages,
      content.trim()
    )

    if (!response.success) {
      throw createError({ statusCode: 500, message: response.error || '生成失败' })
    }

    // 保存助手消息
    const assistantMessage = await conversationService.addMessage({
      conversationId,
      role: 'assistant',
      content: response.content!,
      modelConfigId: assistant.modelConfigId,
      modelName: assistant.modelName,
    })

    return {
      userMessage,
      assistantMessage,
    }
  }
})

// POST /api/messages/[id]/replay - 重放消息（让 AI 重新回复）
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService, writeStreamToResponse } from '../../../services/chat'
import type { LogContext } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '消息ID不能为空' })
  }

  const messageId = parseInt(id, 10)
  if (isNaN(messageId)) {
    throw createError({ statusCode: 400, message: '无效的消息ID' })
  }

  const conversationService = useConversationService()

  // 获取消息
  const message = await conversationService.getMessageById(messageId)
  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  // 获取对话
  const result = await conversationService.getWithMessages(message.conversationId)
  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 确定要重放的用户消息
  let userMessageContent: string
  let messagesBeforeReplay: typeof result.messages

  if (message.role === 'user') {
    // 重放用户消息：基于这条用户消息重新生成 AI 回复
    userMessageContent = message.content
    // 获取这条用户消息之前的所有消息作为上下文
    const msgIndex = result.messages.findIndex(m => m.id === messageId)
    messagesBeforeReplay = result.messages.slice(0, msgIndex)
  } else {
    // 重放 AI 消息：删除这条 AI 消息，找到对应的用户消息重新生成
    // 找到这条 AI 消息之前最近的用户消息
    const msgIndex = result.messages.findIndex(m => m.id === messageId)
    const previousMessages = result.messages.slice(0, msgIndex)
    const lastUserMsg = [...previousMessages].reverse().find(m => m.role === 'user')

    if (!lastUserMsg) {
      throw createError({ statusCode: 400, message: '找不到对应的用户消息' })
    }

    userMessageContent = lastUserMsg.content
    // 获取用户消息之前的所有消息作为上下文
    const userMsgIndex = result.messages.findIndex(m => m.id === lastUserMsg.id)
    messagesBeforeReplay = result.messages.slice(0, userMsgIndex)

    // 删除这条 AI 消息
    await conversationService.removeMessage(messageId, user.id)
  }

  // 获取助手
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(result.conversation.assistantId)

  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  if (!assistant.modelConfigId || !assistant.modelName) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
  }

  // 获取模型配置
  const modelConfigService = useModelConfigService()
  const modelConfig = await modelConfigService.getById(assistant.modelConfigId)

  if (!modelConfig) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 创建聊天服务
  const chatService = createChatService(modelConfig)

  // 构建日志上下文
  const logContext: LogContext = {
    type: '重放',
    conversationId: message.conversationId,
    conversationTitle: result.conversation.title,
  }

  // 流式响应
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  try {
    const generator = chatService.chatStream(
      assistant.modelName,
      assistant.systemPrompt,
      messagesBeforeReplay,
      userMessageContent,
      undefined,
      logContext
    )

    const fullContent = await writeStreamToResponse(
      event,
      generator,
      message.conversationId,
      user.id
    )

    // 保存助手消息
    if (fullContent) {
      await conversationService.addMessage({
        conversationId: message.conversationId,
        role: 'assistant',
        content: fullContent,
        modelConfigId: assistant.modelConfigId,
        modelName: assistant.modelName,
      })
    }

    return
  } catch (error: any) {
    const errorMessage = error.message || '生成失败'
    // 保存错误消息到数据库
    await conversationService.addMessage({
      conversationId: message.conversationId,
      role: 'assistant',
      content: errorMessage,
      modelConfigId: assistant.modelConfigId,
      modelName: assistant.modelName,
      mark: 'error',
    })
    // 发送错误到前端
    const errorData = JSON.stringify({ error: errorMessage, done: true })
    event.node.res.write(`data: ${errorData}\n\n`)
    return
  }
})

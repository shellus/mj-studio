// POST /api/conversations/[id]/generate-title - AI 智能生成对话标题
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService } from '../../../services/chat'
import type { LogContext } from '../../../utils/logger'
import { logTitleResponse } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
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

  if (messages.length === 0) {
    throw createError({ statusCode: 400, message: '对话没有消息' })
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

  // 准备用于生成标题的消息（前2条 + 后2条）
  const contextMessages: string[] = []

  // 前2条
  for (let i = 0; i < Math.min(2, messages.length); i++) {
    const msg = messages[i]
    contextMessages.push(`${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content.slice(0, 200)}`)
  }

  // 后2条（如果和前2条不重叠）
  if (messages.length > 2) {
    const startIdx = Math.max(messages.length - 2, 2)
    for (let i = startIdx; i < messages.length; i++) {
      const msg = messages[i]
      contextMessages.push(`${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content.slice(0, 200)}`)
    }
  }

  // 构建提示词
  const prompt = `请根据以下对话内容，生成一个简洁的对话标题（10-20个字），直接输出标题，不要加引号或其他格式：

${contextMessages.join('\n\n')}`

  // 调用 AI 生成标题
  const chatService = createChatService(modelConfig)

  // 构建日志上下文
  const logContext: LogContext = {
    type: '标题',
    conversationId,
    conversationTitle: result.conversation.title,
  }

  const startTime = Date.now()

  try {
    const response = await chatService.chat(
      assistant.modelName,
      '你是一个标题生成助手，擅长根据对话内容生成简洁准确的标题。',
      [],
      prompt,
      undefined,
      logContext
    )

    if (!response.success || !response.content) {
      throw new Error(response.error || '生成失败')
    }

    // 清理标题（去除引号、换行等）
    let title = response.content
      .replace(/^["'"「『【]|["'"」』】]$/g, '')
      .replace(/\n/g, '')
      .trim()

    // 限制长度
    if (title.length > 30) {
      title = title.slice(0, 30) + '...'
    }

    // 更新对话标题
    await conversationService.updateTitle(conversationId, user.id, title)

    // 记录标题响应日志
    logTitleResponse(logContext, title, Date.now() - startTime)

    return { title }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || '生成标题失败',
    })
  }
})

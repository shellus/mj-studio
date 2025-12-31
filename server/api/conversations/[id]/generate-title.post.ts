// POST /api/conversations/[id]/generate-title - AI 智能生成对话标题
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useUpstreamService } from '../../../services/upstream'
import { useAimodelService } from '../../../services/aimodel'
import { useUserSettingsService } from '../../../services/userSettings'
import { createChatService } from '../../../services/chat'
import { createClaudeChatService } from '../../../services/claude'
import { emitToUser } from '../../../services/globalEvents'
import type { ChatConversationUpdated } from '../../../services/globalEvents'
import type { LogContext } from '../../../utils/logger'
import { logTitleResponse } from '../../../utils/logger'
import { USER_SETTING_KEYS } from '../../../../app/shared/constants'

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

  if (!assistant || !assistant.upstreamId || !assistant.aimodelId || !assistant.modelName) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
  }

  // 获取上游配置
  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(assistant.upstreamId)

  if (!upstream) {
    throw createError({ statusCode: 404, message: '上游配置不存在' })
  }

  // 获取 AI 模型配置
  const aimodelService = useAimodelService()
  const aimodel = await aimodelService.getById(assistant.aimodelId)

  if (!aimodel) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 获取用户设置
  const settingsService = useUserSettingsService()
  const titlePrompt = await settingsService.get<string>(user.id, USER_SETTING_KEYS.PROMPT_GENERATE_TITLE)
  const titleMaxLength = await settingsService.get<number>(user.id, USER_SETTING_KEYS.GENERAL_TITLE_MAX_LENGTH)

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

  // 替换占位符
  const contextContent = contextMessages.join('\n\n')
  const prompt = titlePrompt.replace('{context}', contextContent)

  // 使用 aimodel 中的 apiFormat 和 keyName
  const apiFormat = aimodel.apiFormat
  const keyName = aimodel.keyName

  // 根据 apiFormat 创建对应的聊天服务
  const chatService = apiFormat === 'claude'
    ? createClaudeChatService(upstream, keyName)
    : createChatService(upstream, keyName)

  // 构建日志上下文
  const logContext: LogContext = {
    type: '标题',
    conversationId,
    conversationTitle: result.conversation.title,
    keyName,
  }

  const startTime = Date.now()

  try {
    const response = await chatService.chat(
      assistant.modelName,
      '你是一个标题生成助手，擅长根据对话内容生成简洁准确的标题。',
      [],
      prompt,
      undefined,  // userFiles
      undefined,  // signal
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
    if (title.length > titleMaxLength) {
      title = title.slice(0, titleMaxLength) + '...'
    }

    // 更新对话标题
    const updated = await conversationService.updateTitle(conversationId, user.id, title)

    // 记录标题响应日志
    logTitleResponse(logContext, title, Date.now() - startTime)

    // 广播对话更新事件
    if (updated) {
      await emitToUser<ChatConversationUpdated>(user.id, 'chat.conversation.updated', {
        conversation: {
          id: updated.id,
          title: updated.title,
          updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
        },
      })
    }

    return { title }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || '生成标题失败',
    })
  }
})

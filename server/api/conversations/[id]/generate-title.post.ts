// POST /api/conversations/[id]/generate-title - AI 智能生成对话标题
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useAimodelService } from '../../../services/aimodel'
import { useUserSettingsService } from '../../../services/userSettings'
import { getChatProvider } from '../../../services/chatProviders'
import type { ChatApiFormat } from '../../../services/chatProviders'
import type { LogContext } from '../../../utils/logger'
import { logTitleResponse } from '../../../utils/logger'
import { USER_SETTING_KEYS, MESSAGE_MARK } from '../../../../app/shared/constants'
import { getErrorMessage } from '../../../../app/shared/types'

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

  if (!assistant || !assistant.aimodelId) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
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

  // 提取 systemPrompt（参照 streamingTask.ts）
  const systemPromptMessage = messages.find(m => m.mark === MESSAGE_MARK.SYSTEM_PROMPT)
  const systemPrompt = systemPromptMessage?.content || assistant.systemPrompt || null

  // 构建 historyMessages（参照 streamingTask.ts 普通消息逻辑）
  let historyMessages = messages

  // 从最后一个 COMPRESS_RESPONSE 消息开始（包含它）
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.mark === MESSAGE_MARK.COMPRESS_RESPONSE) {
      historyMessages = messages.slice(i)
      break
    }
  }

  // 过滤掉特殊消息
  historyMessages = historyMessages.filter(m =>
    m.mark !== MESSAGE_MARK.COMPRESS_REQUEST
    && m.mark !== MESSAGE_MARK.SYSTEM_PROMPT
  )

  const apiFormat = aimodel.apiFormat as ChatApiFormat

  // 获取 ChatProvider
  const chatProvider = getChatProvider(apiFormat)
  if (!chatProvider) {
    throw createError({
      statusCode: 500,
      message: `不支持的聊天 API 格式: ${apiFormat}`,
    })
  }
  const chatService = await chatProvider.createService(aimodel)

  // 构建日志上下文
  const logContext: LogContext = {
    type: '标题',
    conversationId,
    conversationTitle: result.conversation.title,
  }

  const startTime = Date.now()

  try {
    const response = await chatService.chat(
      aimodel.modelName,
      systemPrompt,
      historyMessages,
      titlePrompt,
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

    // 更新对话标题（service.updateTitle 会自动广播 chat.conversation.updated 事件）
    await conversationService.updateTitle(conversationId, user.id, title)

    // 记录标题响应日志
    logTitleResponse(logContext, title, Date.now() - startTime)

    return { title }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      message: getErrorMessage(error),
    })
  }
})

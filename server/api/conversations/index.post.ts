// POST /api/conversations - 创建对话
import { useConversationService } from '../../services/conversation'
import { useAssistantService } from '../../services/assistant'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { assistantId, title, enableThinking, enableWebSearch } = body

  if (!assistantId) {
    throw createError({ statusCode: 400, message: '请指定助手' })
  }

  // 验证助手属于当前用户
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(assistantId)
  if (!assistant || assistant.userId !== user.id) {
    throw createError({ statusCode: 400, message: '无效的助手' })
  }

  const service = useConversationService()
  // service.create 会自动广播 chat.conversation.created 事件
  const conversation = await service.create({
    userId: user.id,
    assistantId,
    title: title?.trim() || '新对话',
    autoApproveMcp: assistant.autoApproveMcp ?? false,
    enableThinking: enableThinking ?? false,
    enableWebSearch: enableWebSearch ?? false,
  })

  // 更新助手的对话数量（service.refreshConversationCount 会自动广播 chat.assistant.updated 事件）
  await assistantService.refreshConversationCount(assistantId)

  return conversation
})

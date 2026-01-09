// DELETE /api/conversations/[id] - 删除对话
import { useConversationService } from '../../services/conversation'
import { useAssistantService } from '../../services/assistant'

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

  const service = useConversationService()

  // 删除对话（service 层会自动广播 chat.conversation.deleted 事件）
  const result = await service.remove(conversationId, user.id)

  if (!result.success) {
    throw createError({ statusCode: 404, message: '对话不存在或无权删除' })
  }

  // 更新助手的对话数量（service.refreshConversationCount 会自动广播 chat.assistant.updated 事件）
  if (result.assistantId) {
    const assistantService = useAssistantService()
    await assistantService.refreshConversationCount(result.assistantId)
  }

  return { success: true }
})

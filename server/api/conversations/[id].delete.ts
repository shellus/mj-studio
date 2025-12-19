// DELETE /api/conversations/[id] - 删除对话
import { useConversationService } from '../../services/conversation'

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
  const deleted = await service.remove(conversationId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '对话不存在或无权删除' })
  }

  return { success: true }
})

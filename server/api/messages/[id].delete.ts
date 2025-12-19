// DELETE /api/messages/[id] - 删除消息
import { useConversationService } from '../../services/conversation'

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

  const service = useConversationService()
  const deleted = await service.removeMessage(messageId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '消息不存在或无权删除' })
  }

  return { success: true }
})

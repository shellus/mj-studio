// PATCH /api/messages/[id] - 更新消息内容
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

  const body = await readBody<{ content: string }>(event)
  if (typeof body.content !== 'string') {
    throw createError({ statusCode: 400, message: '消息内容不能为空' })
  }

  const service = useConversationService()
  // service.updateMessageContent 会自动广播 chat.message.updated 事件
  const updated = await service.updateMessageContent(messageId, user.id, body.content)

  if (!updated) {
    throw createError({ statusCode: 404, message: '消息不存在或无权编辑' })
  }

  return { success: true }
})

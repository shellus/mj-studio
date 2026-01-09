// POST /api/messages/[id]/fork - 从指定消息分叉对话
import { useConversationService } from '../../../services/conversation'

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
  // service.fork 内部调用 create 和 addMessage，会自动广播相应事件
  const result = await service.fork(messageId, user.id)

  if (!result) {
    throw createError({ statusCode: 404, message: '消息不存在或无权操作' })
  }

  return {
    success: true,
    conversation: result.conversation,
    messageCount: result.messages.length,
  }
})

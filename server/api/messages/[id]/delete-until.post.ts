// POST /api/messages/[id]/delete-until - 删除指定消息及之前的所有消息
import { useConversationService } from '../../../services/conversation'
import { emitToUser } from '../../../services/globalEvents'
import type { ChatMessagesDeleted } from '../../../services/globalEvents'

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
  const result = await service.removeMessagesUntil(messageId, user.id)

  if (!result) {
    throw createError({ statusCode: 404, message: '消息不存在或无权操作' })
  }

  // 广播批量删除消息事件
  await emitToUser<ChatMessagesDeleted>(user.id, 'chat.messages.deleted', {
    conversationId: result.conversationId,
    messageIds: result.messageIds,
  })

  return {
    success: true,
    deletedCount: result.messageIds.length,
  }
})

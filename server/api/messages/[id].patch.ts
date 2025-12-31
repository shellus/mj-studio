// PATCH /api/messages/[id] - 更新消息内容
import { useConversationService } from '../../services/conversation'
import { emitToUser } from '../../services/globalEvents'
import type { ChatMessageUpdated } from '../../services/globalEvents'

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

  // 获取消息并验证权限
  const message = await service.getMessageById(messageId)
  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  const conversation = await service.getById(message.conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权编辑此消息' })
  }

  // 更新消息内容（保持原状态不变）
  await service.updateMessageContentAndStatus(messageId, body.content, message.status ?? 'completed')

  // 广播消息更新事件
  await emitToUser<ChatMessageUpdated>(user.id, 'chat.message.updated', {
    conversationId: message.conversationId,
    message: {
      id: messageId,
      content: body.content,
      updatedAt: new Date().toISOString(),
    },
  })

  return { success: true }
})

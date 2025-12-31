// DELETE /api/conversations/[id] - 删除对话
import { useConversationService } from '../../services/conversation'
import { emitToUser } from '../../services/globalEvents'
import type { ChatConversationDeleted } from '../../services/globalEvents'

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

  // 先获取对话信息（用于广播事件）
  const conversation = await service.getById(conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 404, message: '对话不存在或无权删除' })
  }

  const deleted = await service.remove(conversationId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '对话不存在或无权删除' })
  }

  // 广播对话删除事件
  await emitToUser<ChatConversationDeleted>(user.id, 'chat.conversation.deleted', {
    conversationId,
    assistantId: conversation.assistantId,
  })

  return { success: true }
})

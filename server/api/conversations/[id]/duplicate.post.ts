// POST /api/conversations/[id]/duplicate - 复制对话（使用最后一条消息分叉）
import { useConversationService } from '../../../services/conversation'

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

  // 获取对话及其消息
  const data = await service.getWithMessages(conversationId)
  if (!data) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (data.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权复制此对话' })
  }

  // 获取最后一条消息
  const lastMessage = data.messages[data.messages.length - 1]
  if (!lastMessage) {
    throw createError({ statusCode: 400, message: '对话没有消息，无法复制' })
  }

  // 使用最后一条消息分叉对话
  const result = await service.fork(lastMessage.id, user.id)
  if (!result) {
    throw createError({ statusCode: 500, message: '复制对话失败' })
  }

  return {
    success: true,
    conversation: result.conversation,
    messageCount: result.messages.length,
  }
})

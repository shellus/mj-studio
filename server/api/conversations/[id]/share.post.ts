// POST /api/conversations/[id]/share - 生成分享链接
import { useConversationService } from '../../../services/conversation'
import { createShareToken } from '../../../utils/shareToken'

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
  const conversation = await service.getById(conversationId)

  if (!conversation) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权分享此对话' })
  }

  const token = await createShareToken(conversationId)

  return { token }
})

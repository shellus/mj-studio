// PUT /api/conversations/[id] - 更新对话标题
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

  const body = await readBody(event)
  const { title } = body

  if (!title?.trim()) {
    throw createError({ statusCode: 400, message: '对话标题不能为空' })
  }

  const service = useConversationService()
  const updated = await service.updateTitle(conversationId, user.id, title.trim())

  if (!updated) {
    throw createError({ statusCode: 404, message: '对话不存在或无权修改' })
  }

  return updated
})

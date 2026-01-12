// POST /api/assistants/[id]/pin - 收藏/取消收藏助手
import { useAssistantService } from '../../../services/assistant'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '助手ID不能为空' })
  }

  const assistantId = parseInt(id, 10)
  if (isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '无效的助手ID' })
  }

  const service = useAssistantService()
  const updated = await service.togglePin(assistantId, user.id)

  if (!updated) {
    throw createError({ statusCode: 404, message: '助手不存在或无权操作' })
  }

  return updated
})

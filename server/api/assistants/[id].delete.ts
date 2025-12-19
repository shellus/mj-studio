// DELETE /api/assistants/[id] - 删除助手
import { useAssistantService } from '../../services/assistant'

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

  // 检查是否是默认助手
  const assistant = await service.getById(assistantId)
  if (assistant?.isDefault) {
    throw createError({ statusCode: 400, message: '不能删除默认助手' })
  }

  const deleted = await service.remove(assistantId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '助手不存在或无权删除' })
  }

  return { success: true }
})

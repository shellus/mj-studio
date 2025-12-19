// GET /api/assistants/[id] - 获取单个助手
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
  const assistant = await service.getById(assistantId)

  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  // 验证权限
  if (assistant.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此助手' })
  }

  return assistant
})

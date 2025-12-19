// DELETE /api/model-configs/[id] - 删除模型配置
import { useModelConfigService } from '../../services/modelConfig'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '配置ID不能为空' })
  }

  const configId = parseInt(id, 10)
  if (isNaN(configId)) {
    throw createError({ statusCode: 400, message: '无效的配置ID' })
  }

  const service = useModelConfigService()
  const deleted = await service.remove(configId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '配置不存在或无权删除' })
  }

  return { success: true }
})

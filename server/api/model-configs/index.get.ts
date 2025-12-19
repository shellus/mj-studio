// GET /api/model-configs - 获取当前用户的模型配置列表
import { useModelConfigService } from '../../services/modelConfig'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const service = useModelConfigService()

  return service.listByUser(user.id)
})

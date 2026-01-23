// GET /api/upstreams/available - 获取当前用户的可用上游配置（仅启用的，不包含敏感信息）
import { useUpstreamService } from '../../services/upstream'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const service = useUpstreamService()

  const upstreams = await service.listAvailableByUser(user.id)

  // 移除敏感信息
  return upstreams.map(u => ({
    id: u.id,
    name: u.name,
    sortOrder: u.sortOrder,
    upstreamInfo: u.upstreamInfo, // 保留余额等信息
    aimodels: u.aimodels.map(m => ({
      id: m.id,
      category: m.category,
      modelType: m.modelType,
      name: m.name,
      capabilities: m.capabilities,
      estimatedTime: m.estimatedTime,
      sortOrder: m.sortOrder,
    })),
  }))
})

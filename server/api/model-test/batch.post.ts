/**
 * POST /api/model-test/batch - 批量操作模型
 *
 * 支持批量禁用和删除模型
 */
import { useAimodelService } from '../../services/aimodel'
import { useUpstreamService } from '../../services/upstream'
import { db } from '../../database'
import { aimodels } from '../../database/schema'
import { eq, inArray } from 'drizzle-orm'

interface BatchBody {
  action: 'disable' | 'delete'
  aimodelIds: number[]
}

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody<BatchBody>(event)

  // 验证参数
  if (!body.action || !['disable', 'delete'].includes(body.action)) {
    throw createError({
      statusCode: 400,
      message: '无效的操作类型',
    })
  }

  if (!body.aimodelIds || !Array.isArray(body.aimodelIds) || body.aimodelIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: '请选择要操作的模型',
    })
  }

  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 验证所有模型都属于当前用户
  const userUpstreams = await upstreamService.listByUser(user.id)
  const userUpstreamIds = new Set(userUpstreams.map(u => u.id))

  // 获取要操作的模型
  const models = await db.query.aimodels.findMany({
    where: inArray(aimodels.id, body.aimodelIds),
  })

  // 过滤出属于当前用户的模型
  const validModels = models.filter(m => userUpstreamIds.has(m.upstreamId))

  if (validModels.length === 0) {
    throw createError({
      statusCode: 400,
      message: '没有可操作的模型',
    })
  }

  // 执行操作
  let successCount = 0

  if (body.action === 'delete') {
    for (const model of validModels) {
      const success = await aimodelService.remove(model.id)
      if (success) successCount++
    }
  }

  return {
    action: body.action,
    requestedCount: body.aimodelIds.length,
    successCount,
  }
})

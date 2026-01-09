/**
 * list_models 工具实现
 */
import type { AuthUser, ModelCategory } from '../../../../app/shared/types'
import { db } from '../../../database'
import { aimodels, upstreams } from '../../../database/schema'
import { eq, and, isNull } from 'drizzle-orm'

export async function listModels(user: AuthUser, category?: ModelCategory) {
  // 获取用户的所有上游
  const userUpstreams = await db.query.upstreams.findMany({
    where: and(
      eq(upstreams.userId, user.id),
      isNull(upstreams.deletedAt),
    ),
  })

  if (userUpstreams.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ models: [] }) }],
    }
  }

  // 获取所有上游的模型
  const upstreamIds = userUpstreams.map(u => u.id)
  const upstreamMap = new Map(userUpstreams.map(u => [u.id, u.name]))

  let query = and(
    isNull(aimodels.deletedAt),
  )

  // 按分类筛选
  if (category) {
    query = and(query, eq(aimodels.category, category))
  }

  const models = await db.query.aimodels.findMany({
    where: query,
  })

  // 过滤只属于用户上游的模型
  const filteredModels = models.filter(m => upstreamIds.includes(m.upstreamId))

  const result = {
    models: filteredModels.map(m => ({
      aimodelId: m.id,
      name: m.name,
      category: m.category,
      modelType: m.modelType,
      upstreamName: upstreamMap.get(m.upstreamId) || '',
    })),
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

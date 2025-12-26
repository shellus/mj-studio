// AI 模型服务层
import { db } from '../database'
import { aimodels, upstreams, type Aimodel, type NewAimodel, type ModelCategory, type ModelType, type ApiFormat } from '../database/schema'
import { eq, and, isNull } from 'drizzle-orm'

export function useAimodelService() {
  // 获取上游的所有模型
  async function listByUpstream(upstreamId: number): Promise<Aimodel[]> {
    return db.query.aimodels.findMany({
      where: eq(aimodels.upstreamId, upstreamId),
    })
  }

  // 获取单个模型
  async function getById(id: number): Promise<Aimodel | undefined> {
    return db.query.aimodels.findFirst({
      where: eq(aimodels.id, id),
    })
  }

  // 根据上游ID和模型名称查找模型
  async function findByModelName(
    upstreamId: number,
    modelName: string
  ): Promise<Aimodel | undefined> {
    return db.query.aimodels.findFirst({
      where: and(
        eq(aimodels.upstreamId, upstreamId),
        eq(aimodels.modelName, modelName),
      ),
    })
  }

  // 根据上游ID和模型类型查找模型
  async function findByModelType(
    upstreamId: number,
    modelType: ModelType
  ): Promise<Aimodel | undefined> {
    return db.query.aimodels.findFirst({
      where: and(
        eq(aimodels.upstreamId, upstreamId),
        eq(aimodels.modelType, modelType),
      ),
    })
  }

  // 根据用户ID和模型名称查找模型（跨所有上游）
  async function findByUserAndModelName(
    userId: number,
    modelName: string,
    category?: ModelCategory
  ): Promise<{ upstream: typeof upstreams.$inferSelect; aimodel: Aimodel } | undefined> {
    // 获取用户所有上游
    const userUpstreams = await db.query.upstreams.findMany({
      where: eq(upstreams.userId, userId),
    })

    for (const upstream of userUpstreams) {
      let query = and(
        eq(aimodels.upstreamId, upstream.id),
        eq(aimodels.modelName, modelName),
      )

      if (category) {
        query = and(query, eq(aimodels.category, category))
      }

      const aimodel = await db.query.aimodels.findFirst({
        where: query,
      })

      if (aimodel) {
        return { upstream, aimodel }
      }
    }

    return undefined
  }

  // 创建模型
  async function create(data: {
    upstreamId: number
    category: ModelCategory
    modelType: ModelType
    apiFormat: ApiFormat
    modelName: string
    estimatedTime?: number
    keyName?: string
  }): Promise<Aimodel> {
    const [aimodel] = await db.insert(aimodels).values({
      upstreamId: data.upstreamId,
      category: data.category,
      modelType: data.modelType,
      apiFormat: data.apiFormat,
      modelName: data.modelName,
      estimatedTime: data.estimatedTime ?? 60,
      keyName: data.keyName ?? 'default',
    }).returning()

    return aimodel
  }

  // 批量创建模型
  async function createMany(data: Array<{
    upstreamId: number
    category: ModelCategory
    modelType: ModelType
    apiFormat: ApiFormat
    modelName: string
    estimatedTime?: number
    keyName?: string
  }>): Promise<Aimodel[]> {
    if (data.length === 0) return []

    const values = data.map(d => ({
      upstreamId: d.upstreamId,
      category: d.category,
      modelType: d.modelType,
      apiFormat: d.apiFormat,
      modelName: d.modelName,
      estimatedTime: d.estimatedTime ?? 60,
      keyName: d.keyName ?? 'default',
    }))

    return db.insert(aimodels).values(values).returning()
  }

  // 更新模型
  async function update(id: number, data: Partial<{
    category: ModelCategory
    modelType: ModelType
    apiFormat: ApiFormat
    modelName: string
    estimatedTime: number
    keyName: string
  }>): Promise<Aimodel | undefined> {
    const [updated] = await db.update(aimodels)
      .set(data)
      .where(eq(aimodels.id, id))
      .returning()

    return updated
  }

  // 更新模型的预计时间（根据实际耗时自动更新）
  async function updateEstimatedTime(
    upstreamId: number,
    modelName: string,
    actualTime: number
  ): Promise<void> {
    await db.update(aimodels)
      .set({ estimatedTime: Math.round(actualTime) })
      .where(and(
        eq(aimodels.upstreamId, upstreamId),
        eq(aimodels.modelName, modelName),
      ))
  }

  // 删除模型（软删除）
  async function remove(id: number): Promise<boolean> {
    const result = await db.update(aimodels)
      .set({ deletedAt: new Date() })
      .where(eq(aimodels.id, id))
      .returning()

    return result.length > 0
  }

  // 删除上游的所有模型
  async function removeByUpstream(upstreamId: number): Promise<number> {
    const result = await db.delete(aimodels)
      .where(eq(aimodels.upstreamId, upstreamId))
      .returning()

    return result.length
  }

  // 同步上游的模型配置（智能同步：更新已有、创建新的、软删除移除的）
  async function syncByUpstream(upstreamId: number, models: Array<{
    id?: number
    category: ModelCategory
    modelType: ModelType
    apiFormat: ApiFormat
    modelName: string
    estimatedTime?: number
    keyName?: string
  }>): Promise<Aimodel[]> {
    // 获取现有的所有模型（包括已软删除的）
    const existing = await db.query.aimodels.findMany({
      where: eq(aimodels.upstreamId, upstreamId),
    })

    const existingIds = new Set(existing.map(m => m.id))
    const inputIds = new Set(models.filter(m => m.id).map(m => m.id!))

    // 1. 更新已有模型
    for (const model of models.filter(m => m.id)) {
      await db.update(aimodels)
        .set({
          category: model.category,
          modelType: model.modelType,
          apiFormat: model.apiFormat,
          modelName: model.modelName,
          estimatedTime: model.estimatedTime ?? 60,
          keyName: model.keyName ?? 'default',
          deletedAt: null,  // 如果之前被软删除，恢复它
        })
        .where(eq(aimodels.id, model.id!))
    }

    // 2. 创建新模型
    const newModels = models.filter(m => !m.id)
    if (newModels.length > 0) {
      await createMany(newModels.map(m => ({ ...m, upstreamId })))
    }

    // 3. 软删除不在列表中的模型（排除已经软删除的）
    const toDelete = existing.filter(m => !inputIds.has(m.id) && !m.deletedAt)
    for (const model of toDelete) {
      await db.update(aimodels)
        .set({ deletedAt: new Date() })
        .where(eq(aimodels.id, model.id))
    }

    // 返回最新的模型列表（排除软删除的）
    return db.query.aimodels.findMany({
      where: and(
        eq(aimodels.upstreamId, upstreamId),
        isNull(aimodels.deletedAt),
      ),
    })
  }

  return {
    listByUpstream,
    getById,
    findByModelName,
    findByModelType,
    findByUserAndModelName,
    create,
    createMany,
    update,
    updateEstimatedTime,
    remove,
    removeByUpstream,
    syncByUpstream,
  }
}

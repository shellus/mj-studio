// 模型配置服务层
import { db } from '../database'
import { modelConfigs, type ModelConfig, type NewModelConfig, type ModelType } from '../database/schema'
import { eq, and } from 'drizzle-orm'

export function useModelConfigService() {
  // 获取用户的所有模型配置
  async function listByUser(userId: number): Promise<ModelConfig[]> {
    return db.query.modelConfigs.findMany({
      where: eq(modelConfigs.userId, userId),
    })
  }

  // 获取单个配置
  async function getById(id: number): Promise<ModelConfig | undefined> {
    return db.query.modelConfigs.findFirst({
      where: eq(modelConfigs.id, id),
    })
  }

  // 获取用户的默认配置
  async function getDefault(userId: number): Promise<ModelConfig | undefined> {
    return db.query.modelConfigs.findFirst({
      where: and(eq(modelConfigs.userId, userId), eq(modelConfigs.isDefault, true)),
    })
  }

  // 创建配置
  async function create(data: {
    userId: number
    name: string
    types: ModelType[]
    baseUrl: string
    apiKey: string
    remark?: string
    isDefault?: boolean
  }): Promise<ModelConfig> {
    // 如果设为默认，先取消其他默认
    if (data.isDefault) {
      await db.update(modelConfigs)
        .set({ isDefault: false })
        .where(eq(modelConfigs.userId, data.userId))
    }

    const [config] = await db.insert(modelConfigs).values({
      userId: data.userId,
      name: data.name,
      types: data.types,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      remark: data.remark ?? null,
      isDefault: data.isDefault ?? false,
    }).returning()

    return config
  }

  // 更新配置
  async function update(id: number, userId: number, data: Partial<{
    name: string
    types: ModelType[]
    baseUrl: string
    apiKey: string
    remark: string | null
    isDefault: boolean
  }>): Promise<ModelConfig | undefined> {
    // 如果设为默认，先取消其他默认
    if (data.isDefault) {
      await db.update(modelConfigs)
        .set({ isDefault: false })
        .where(eq(modelConfigs.userId, userId))
    }

    const [updated] = await db.update(modelConfigs)
      .set(data)
      .where(and(eq(modelConfigs.id, id), eq(modelConfigs.userId, userId)))
      .returning()

    return updated
  }

  // 删除配置
  async function remove(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(modelConfigs)
      .where(and(eq(modelConfigs.id, id), eq(modelConfigs.userId, userId)))
      .returning()

    return result.length > 0
  }

  return {
    listByUser,
    getById,
    getDefault,
    create,
    update,
    remove,
  }
}

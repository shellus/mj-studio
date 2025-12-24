// 模型配置服务层
import { db } from '../database'
import { modelConfigs, type ModelConfig, type NewModelConfig, type ModelTypeConfig } from '../database/schema'
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
    baseUrl: string
    apiKey: string
    modelTypeConfigs: ModelTypeConfig[]
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
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      modelTypeConfigs: data.modelTypeConfigs,
      remark: data.remark ?? null,
      isDefault: data.isDefault ?? false,
    }).returning()

    return config
  }

  // 更新配置
  async function update(id: number, userId: number, data: Partial<{
    name: string
    baseUrl: string
    apiKey: string
    modelTypeConfigs: ModelTypeConfig[]
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

  // 根据模型名称查找配置（用于嵌入式绘图组件）
  async function findByModelName(
    userId: number,
    modelName: string | undefined,
    category: 'image' | 'chat'
  ): Promise<{ config: ModelConfig; modelTypeConfig: ModelTypeConfig } | undefined> {
    const configs = await listByUser(userId)

    // 遍历所有配置，查找匹配的模型
    for (const config of configs) {
      for (const mtc of config.modelTypeConfigs || []) {
        // 检查分类是否匹配
        const mtcCategory = mtc.category || 'image' // 兼容旧数据
        if (mtcCategory !== category) continue

        // 如果指定了 modelName，精确匹配
        if (modelName) {
          if (mtc.modelName.toLowerCase() === modelName.toLowerCase()) {
            return { config, modelTypeConfig: mtc }
          }
        }
      }
    }

    // 如果没有指定 modelName 或未找到精确匹配，返回默认配置的第一个匹配分类的模型
    if (!modelName) {
      const defaultConfig = await getDefault(userId)
      if (defaultConfig) {
        const mtc = defaultConfig.modelTypeConfigs?.find(
          m => (m.category || 'image') === category
        )
        if (mtc) {
          return { config: defaultConfig, modelTypeConfig: mtc }
        }
      }

      // 没有默认配置，返回第一个匹配的
      for (const config of configs) {
        const mtc = config.modelTypeConfigs?.find(
          m => (m.category || 'image') === category
        )
        if (mtc) {
          return { config, modelTypeConfig: mtc }
        }
      }
    }

    return undefined
  }

  return {
    listByUser,
    getById,
    getDefault,
    create,
    update,
    remove,
    findByModelName,
  }
}

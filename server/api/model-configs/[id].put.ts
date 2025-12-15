// PUT /api/model-configs/[id] - 更新模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelType } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '配置ID不能为空' })
  }

  const configId = parseInt(id, 10)
  if (isNaN(configId)) {
    throw createError({ statusCode: 400, message: '无效的配置ID' })
  }

  const body = await readBody(event)
  const { name, types, baseUrl, apiKey, remark, isDefault } = body

  // 构建更新数据
  const updateData: Record<string, any> = {}

  if (name !== undefined) {
    if (!name.trim()) {
      throw createError({ statusCode: 400, message: '配置名称不能为空' })
    }
    updateData.name = name.trim()
  }

  if (types !== undefined) {
    const validTypes: ModelType[] = ['midjourney', 'gemini']
    if (!Array.isArray(types) || types.length === 0) {
      throw createError({ statusCode: 400, message: '请至少选择一种模型类型' })
    }
    for (const t of types) {
      if (!validTypes.includes(t)) {
        throw createError({ statusCode: 400, message: `不支持的模型类型: ${t}` })
      }
    }
    updateData.types = types
  }

  if (baseUrl !== undefined) {
    if (!baseUrl.trim()) {
      throw createError({ statusCode: 400, message: 'API地址不能为空' })
    }
    updateData.baseUrl = baseUrl.trim()
  }

  if (apiKey !== undefined) {
    if (!apiKey.trim()) {
      throw createError({ statusCode: 400, message: 'API密钥不能为空' })
    }
    updateData.apiKey = apiKey.trim()
  }

  if (remark !== undefined) {
    updateData.remark = remark?.trim() || null
  }

  if (isDefault !== undefined) {
    updateData.isDefault = isDefault
  }

  const service = useModelConfigService()
  const updated = await service.update(configId, user.id, updateData)

  if (!updated) {
    throw createError({ statusCode: 404, message: '配置不存在或无权修改' })
  }

  return updated
})

// PUT /api/model-configs/[id] - 更新模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelType, ApiFormat, ModelTypeConfig } from '../../database/schema'

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
  const { name, baseUrl, apiKey, modelTypeConfigs, remark, isDefault } = body

  // 构建更新数据
  const updateData: Record<string, any> = {}

  if (name !== undefined) {
    if (!name.trim()) {
      throw createError({ statusCode: 400, message: '配置名称不能为空' })
    }
    updateData.name = name.trim()
  }

  if (modelTypeConfigs !== undefined) {
    const validModelTypes: ModelType[] = ['midjourney', 'gemini', 'flux', 'dalle', 'doubao', 'gpt4o-image', 'grok-image']
    const validApiFormats: ApiFormat[] = ['mj-proxy', 'gemini', 'dalle', 'openai-chat']

    if (!Array.isArray(modelTypeConfigs) || modelTypeConfigs.length === 0) {
      throw createError({ statusCode: 400, message: '请至少添加一种模型类型' })
    }
    for (const mtc of modelTypeConfigs) {
      if (!validModelTypes.includes(mtc.modelType)) {
        throw createError({ statusCode: 400, message: `不支持的模型类型: ${mtc.modelType}` })
      }
      if (!validApiFormats.includes(mtc.apiFormat)) {
        throw createError({ statusCode: 400, message: `不支持的API格式: ${mtc.apiFormat}` })
      }
    }
    updateData.modelTypeConfigs = modelTypeConfigs
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

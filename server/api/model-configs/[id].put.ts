// PUT /api/model-configs/[id] - 更新模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelType, ChatModelType, ApiFormat, ModelTypeConfig } from '../../database/schema'
import { IMAGE_MODEL_TYPES, API_FORMATS } from '~/shared/constants'

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
    if (!Array.isArray(modelTypeConfigs) || modelTypeConfigs.length === 0) {
      throw createError({ statusCode: 400, message: '请至少添加一种模型类型' })
    }
    // 验证 API 格式（必须是已知格式）
    for (const mtc of modelTypeConfigs) {
      if (!API_FORMATS.includes(mtc.apiFormat)) {
        throw createError({ statusCode: 400, message: `不支持的API格式: ${mtc.apiFormat}` })
      }
      // 绘图模型必须是已知类型，对话模型允许自定义类型（因为都用 openai-chat 格式）
      if (mtc.category === 'image' && !IMAGE_MODEL_TYPES.includes(mtc.modelType)) {
        throw createError({ statusCode: 400, message: `不支持的绘图模型类型: ${mtc.modelType}` })
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

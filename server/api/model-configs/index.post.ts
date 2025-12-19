// POST /api/model-configs - 创建模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelTypeConfig, ModelType, ChatModelType, ApiFormat, MODEL_FORMAT_MAP } from '../../database/schema'
import { IMAGE_MODEL_TYPES, CHAT_MODEL_TYPES, API_FORMATS } from '~/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { name, baseUrl, apiKey, modelTypeConfigs, remark, isDefault } = body

  // 验证必填字段
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: '请输入配置名称' })
  }

  // 验证模型类型配置数组
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

  if (!baseUrl?.trim()) {
    throw createError({ statusCode: 400, message: '请输入API地址' })
  }

  if (!apiKey?.trim()) {
    throw createError({ statusCode: 400, message: '请输入API密钥' })
  }

  const service = useModelConfigService()

  const config = await service.create({
    userId: user.id,
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    modelTypeConfigs,
    remark: remark?.trim() || undefined,
    isDefault: isDefault ?? false,
  })

  return config
})

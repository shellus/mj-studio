// POST /api/model-configs - 创建模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelTypeConfig, ModelType, ChatModelType, ApiFormat, MODEL_FORMAT_MAP } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
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

  const validImageModelTypes: ModelType[] = ['midjourney', 'gemini', 'flux', 'dalle', 'doubao', 'gpt4o-image', 'grok-image', 'qwen-image']
  const validChatModelTypes: ChatModelType[] = ['gpt', 'claude', 'gemini-chat', 'deepseek', 'qwen-chat']
  const validModelTypes = [...validImageModelTypes, ...validChatModelTypes]
  const validApiFormats: ApiFormat[] = ['mj-proxy', 'gemini', 'dalle', 'openai-chat']

  for (const mtc of modelTypeConfigs) {
    if (!validModelTypes.includes(mtc.modelType)) {
      throw createError({ statusCode: 400, message: `不支持的模型类型: ${mtc.modelType}` })
    }
    if (!validApiFormats.includes(mtc.apiFormat)) {
      throw createError({ statusCode: 400, message: `不支持的API格式: ${mtc.apiFormat}` })
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

// POST /api/upstreams - 创建上游配置（包含 aimodels）
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import type { AimodelInput } from '../../../app/shared/types'
import { getAllApiFormats, IMAGE_MODEL_REGISTRY } from '../../services/providers'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { name, baseUrl, apiKeys, aimodels, remark, sortOrder, upstreamPlatform, userApiKey } = body

  // 验证必填字段
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: '请输入配置名称' })
  }

  // 验证 apiKeys
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw createError({ statusCode: 400, message: '请至少添加一个 API Key' })
  }

  // 验证单 Key 时必须为 default
  if (apiKeys.length === 1 && apiKeys[0].name !== 'default') {
    throw createError({ statusCode: 400, message: '只有一个 Key 时，名称必须为 default' })
  }

  // 验证模型配置数组
  if (!Array.isArray(aimodels) || aimodels.length === 0) {
    throw createError({ statusCode: 400, message: '请至少添加一种模型' })
  }

  // 验证 API 格式（必须是已知格式）
  const validApiFormats = getAllApiFormats()
  const chatApiFormats = ['openai-chat', 'claude'] // 对话模型专用格式
  const validImageModelTypes = IMAGE_MODEL_REGISTRY.map(m => m.type)
  for (const model of aimodels as AimodelInput[]) {
    const isValidFormat = validApiFormats.includes(model.apiFormat) || chatApiFormats.includes(model.apiFormat)
    if (!isValidFormat) {
      throw createError({ statusCode: 400, message: `不支持的API格式: ${model.apiFormat}` })
    }
    // 绘图模型必须是已知类型，对话模型允许自定义类型
    if (model.category === 'image' && !validImageModelTypes.includes(model.modelType as any)) {
      throw createError({ statusCode: 400, message: `不支持的绘图模型类型: ${model.modelType}` })
    }
  }

  if (!baseUrl?.trim()) {
    throw createError({ statusCode: 400, message: '请输入API地址' })
  }

  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 创建上游配置
  const upstream = await upstreamService.create({
    userId: user.id,
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    apiKeys,
    remark: remark?.trim() || undefined,
    sortOrder,
    upstreamPlatform,
    userApiKey,
  })

  // 批量创建关联的 aimodels
  const createdModels = await aimodelService.createMany(
    (aimodels as AimodelInput[]).map(m => ({
      upstreamId: upstream.id,
      category: m.category,
      modelType: m.modelType,
      apiFormat: m.apiFormat,
      modelName: m.modelName,
      name: m.name,  // 显示名称
      estimatedTime: m.estimatedTime,
      keyName: m.keyName ?? 'default',
    }))
  )

  return { ...upstream, aimodels: createdModels }
})

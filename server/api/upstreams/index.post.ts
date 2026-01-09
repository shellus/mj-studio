// POST /api/upstreams - 创建上游配置（包含 aimodels）
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import type { AimodelInput } from '../../../app/shared/types'
import { IMAGE_MODEL_TYPES, API_FORMATS } from '~/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { name, baseUrl, apiKey, apiKeys, aimodels, remark, sortOrder, upstreamPlatform, userApiKey } = body

  // 验证必填字段
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: '请输入配置名称' })
  }

  // 验证模型配置数组
  if (!Array.isArray(aimodels) || aimodels.length === 0) {
    throw createError({ statusCode: 400, message: '请至少添加一种模型' })
  }

  // 验证 API 格式（必须是已知格式）
  for (const model of aimodels as AimodelInput[]) {
    if (!API_FORMATS.includes(model.apiFormat)) {
      throw createError({ statusCode: 400, message: `不支持的API格式: ${model.apiFormat}` })
    }
    // 绘图模型必须是已知类型，对话模型允许自定义类型
    if (model.category === 'image' && !IMAGE_MODEL_TYPES.includes(model.modelType as any)) {
      throw createError({ statusCode: 400, message: `不支持的绘图模型类型: ${model.modelType}` })
    }
  }

  if (!baseUrl?.trim()) {
    throw createError({ statusCode: 400, message: '请输入API地址' })
  }

  if (!apiKey?.trim()) {
    throw createError({ statusCode: 400, message: '请输入API密钥' })
  }

  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 创建上游配置
  const upstream = await upstreamService.create({
    userId: user.id,
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
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

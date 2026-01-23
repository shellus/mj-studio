// PUT /api/upstreams/[id] - 更新上游配置（包含 aimodels）
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import type { AimodelInput } from '../../../app/shared/types'
import { getAllApiFormats, IMAGE_MODEL_REGISTRY } from '../../services/providers'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '配置ID不能为空' })
  }

  const upstreamId = parseInt(id, 10)
  if (isNaN(upstreamId)) {
    throw createError({ statusCode: 400, message: '无效的配置ID' })
  }

  const body = await readBody(event)
  const { name, baseUrl, apiKeys, aimodels, remark, sortOrder, upstreamPlatform, userApiKey } = body

  // 构建更新数据
  const updateData: Record<string, any> = {}

  if (name !== undefined) {
    if (!name.trim()) {
      throw createError({ statusCode: 400, message: '配置名称不能为空' })
    }
    updateData.name = name.trim()
  }

  if (baseUrl !== undefined) {
    if (!baseUrl.trim()) {
      throw createError({ statusCode: 400, message: 'API地址不能为空' })
    }
    updateData.baseUrl = baseUrl.trim()
  }

  if (apiKeys !== undefined) {
    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
      throw createError({ statusCode: 400, message: '请至少添加一个 API Key' })
    }
    // 验证单 Key 时必须为 default
    if (apiKeys.length === 1 && apiKeys[0].name !== 'default') {
      throw createError({ statusCode: 400, message: '只有一个 Key 时，名称必须为 default' })
    }
    updateData.apiKeys = apiKeys
  }

  if (remark !== undefined) {
    updateData.remark = remark?.trim() || null
  }

  if (sortOrder !== undefined) {
    updateData.sortOrder = sortOrder
  }

  if (upstreamPlatform !== undefined) {
    updateData.upstreamPlatform = upstreamPlatform
  }

  if (userApiKey !== undefined) {
    updateData.userApiKey = userApiKey
  }

  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 更新上游配置
  const updated = await upstreamService.update(upstreamId, user.id, updateData)

  if (!updated) {
    throw createError({ statusCode: 404, message: '配置不存在或无权修改' })
  }

  // 如果提供了 aimodels，同步更新
  if (aimodels !== undefined) {
    if (!Array.isArray(aimodels) || aimodels.length === 0) {
      throw createError({ statusCode: 400, message: '请至少添加一种模型' })
    }

    // 验证 API 格式
    const validApiFormats = getAllApiFormats()
    const chatApiFormats = ['openai-chat', 'openai-response', 'claude'] // 对话模型专用格式
    const validImageModelTypes = IMAGE_MODEL_REGISTRY.map(m => m.type)
    for (const model of aimodels as AimodelInput[]) {
      const isValidFormat = validApiFormats.includes(model.apiFormat) || chatApiFormats.includes(model.apiFormat)
      if (!isValidFormat) {
        throw createError({ statusCode: 400, message: `不支持的API格式: ${model.apiFormat}` })
      }
      if (model.category === 'image' && !validImageModelTypes.includes(model.modelType as any)) {
        throw createError({ statusCode: 400, message: `不支持的绘图模型类型: ${model.modelType}` })
      }
    }

    // 同步 aimodels（智能同步：有 ID 更新，无 ID 创建，不在列表软删除）
    await aimodelService.syncByUpstream(
      upstreamId,
      (aimodels as AimodelInput[]).map(m => ({
        id: m.id,  // 传递 ID
        category: m.category,
        modelType: m.modelType,
        apiFormat: m.apiFormat,
        modelName: m.modelName,
        name: m.name,  // 显示名称
        estimatedTime: m.estimatedTime,
        keyName: m.keyName ?? 'default',
        capabilities: m.capabilities,  // 模型能力
        sortOrder: m.sortOrder,  // 排序顺序
      }))
    )
  }

  // 返回更新后的完整数据（包含 aimodels）
  return upstreamService.getById(upstreamId)
})

// POST /api/model-configs - 创建模型配置
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelType } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)

  const { name, types, baseUrl, apiKey, remark, isDefault } = body

  // 验证必填字段
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: '请输入配置名称' })
  }

  // 验证模型类型数组
  const validTypes: ModelType[] = ['midjourney', 'gemini']
  if (!Array.isArray(types) || types.length === 0) {
    throw createError({ statusCode: 400, message: '请至少选择一种模型类型' })
  }
  for (const t of types) {
    if (!validTypes.includes(t)) {
      throw createError({ statusCode: 400, message: `不支持的模型类型: ${t}` })
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
    types,
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    remark: remark?.trim() || undefined,
    isDefault: isDefault ?? false,
  })

  return config
})

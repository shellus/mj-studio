// POST /api/assistants - 创建助手
import { useAssistantService } from '../../services/assistant'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { name, description, avatar, systemPrompt, aimodelId, isDefault } = body

  // 验证必填字段
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: '请输入助手名称' })
  }

  const service = useAssistantService()

  const assistant = await service.create({
    userId: user.id,
    name: name.trim(),
    description: description?.trim() || undefined,
    avatar: avatar || undefined,
    systemPrompt: systemPrompt?.trim() || undefined,
    aimodelId: aimodelId || undefined,
    isDefault: isDefault ?? false,
  })

  return assistant
})

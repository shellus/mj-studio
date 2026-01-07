// PUT /api/assistants/[id] - 更新助手
import { useAssistantService } from '../../services/assistant'
import { emitToUser } from '../../services/globalEvents'
import type { ChatAssistantUpdated } from '../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '助手ID不能为空' })
  }

  const assistantId = parseInt(id, 10)
  if (isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '无效的助手ID' })
  }

  const body = await readBody(event)
  const { name, description, avatar, systemPrompt, aimodelId, isDefault } = body

  // 构建更新对象
  const updateData: Record<string, any> = {}

  if (name !== undefined) {
    if (!name.trim()) {
      throw createError({ statusCode: 400, message: '助手名称不能为空' })
    }
    updateData.name = name.trim()
  }

  if (description !== undefined) {
    updateData.description = description?.trim() || null
  }

  if (avatar !== undefined) {
    updateData.avatar = avatar || null
  }

  if (systemPrompt !== undefined) {
    updateData.systemPrompt = systemPrompt?.trim() || null
  }

  if (aimodelId !== undefined) {
    updateData.aimodelId = aimodelId || null
  }

  if (isDefault !== undefined) {
    updateData.isDefault = isDefault
  }

  const service = useAssistantService()
  const updated = await service.update(assistantId, user.id, updateData)

  if (!updated) {
    throw createError({ statusCode: 404, message: '助手不存在或无权修改' })
  }

  // 广播助手更新事件
  await emitToUser<ChatAssistantUpdated>(user.id, 'chat.assistant.updated', {
    assistant: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      avatar: updated.avatar,
      systemPrompt: updated.systemPrompt,
      aimodelId: updated.aimodelId,
      isDefault: updated.isDefault,
      suggestions: updated.suggestions,
      conversationCount: updated.conversationCount,
    },
  })

  return updated
})

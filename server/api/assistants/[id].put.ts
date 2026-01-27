// PUT /api/assistants/[id] - 更新助手
import { useAssistantService } from '../../services/assistant'
import { useMcpServerService } from '../../services/mcpServer'

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
  const { name, description, avatar, systemPrompt, aimodelId, isDefault, enableThinking, mcpServerIds, autoApproveMcp } = body

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

  if (enableThinking !== undefined) {
    updateData.enableThinking = enableThinking
  }

  if (autoApproveMcp !== undefined) {
    updateData.autoApproveMcp = autoApproveMcp
  }

  const service = useAssistantService()
  // service.update 会自动广播 chat.assistant.updated 事件
  const updated = await service.update(assistantId, user.id, updateData)

  if (!updated) {
    throw createError({ statusCode: 404, message: '助手不存在或无权修改' })
  }

  // 更新 MCP 服务关联
  if (mcpServerIds !== undefined && Array.isArray(mcpServerIds)) {
    const mcpService = useMcpServerService()
    await mcpService.setAssistantServers(assistantId, mcpServerIds)
  }

  return updated
})

// PUT /api/conversations/[id] - 更新对话
import { useConversationService } from '../../services/conversation'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '对话ID不能为空' })
  }

  const conversationId = parseInt(id, 10)
  if (isNaN(conversationId)) {
    throw createError({ statusCode: 400, message: '无效的对话ID' })
  }

  const body = await readBody(event)
  const { title, autoApproveMcp, enableThinking, enableWebSearch } = body

  const service = useConversationService()

  // 更新标题
  if (title !== undefined) {
    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: '对话标题不能为空' })
    }
    // service.updateTitle 会自动广播 chat.conversation.updated 事件
    const updated = await service.updateTitle(conversationId, user.id, title.trim())
    if (!updated) {
      throw createError({ statusCode: 404, message: '对话不存在或无权修改' })
    }
    return updated
  }

  // 更新自动通过 MCP 设置
  if (autoApproveMcp !== undefined) {
    const updated = await service.updateAutoApproveMcp(conversationId, user.id, autoApproveMcp)
    if (!updated) {
      throw createError({ statusCode: 404, message: '对话不存在或无权修改' })
    }
    return updated
  }

  // 更新思考开关
  if (enableThinking !== undefined) {
    const updated = await service.updateEnableThinking(conversationId, user.id, enableThinking)
    if (!updated) {
      throw createError({ statusCode: 404, message: '对话不存在或无权修改' })
    }
    return updated
  }

  // 更新 Web 搜索开关
  if (enableWebSearch !== undefined) {
    const updated = await service.updateEnableWebSearch(conversationId, user.id, enableWebSearch)
    if (!updated) {
      throw createError({ statusCode: 404, message: '对话不存在或无权修改' })
    }
    return updated
  }

  throw createError({ statusCode: 400, message: '请提供要更新的字段' })
})

// GET /api/share/[token] - 获取分享的对话内容（无需登录）
import { useConversationService } from '../../services/conversation'
import { useAssistantService } from '../../services/assistant'
import { useTaskService } from '../../services/task'
import { verifyShareToken } from '../../utils/shareToken'

// 从消息内容中提取所有 mj-drawing 的 uniqueId
function extractUniqueIds(content: string): string[] {
  const regex = /```mj-drawing\s*\n[\s\S]*?uniqueId:\s*([^\n]+)/g
  const ids: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const id = match[1]
    if (id) {
      ids.push(id.trim())
    }
  }
  return ids
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({ statusCode: 400, message: '分享链接无效' })
  }

  const payload = await verifyShareToken(token)
  if (!payload) {
    throw createError({ statusCode: 400, message: '分享链接无效或已过期' })
  }

  const conversationService = useConversationService()
  const result = await conversationService.getWithMessages(payload.conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在或已被删除' })
  }

  // 获取助手信息
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(result.conversation.assistantId)

  // 提取所有消息中的 uniqueId 并查询插图
  const taskService = useTaskService()
  const allUniqueIds: string[] = []
  for (const msg of result.messages) {
    allUniqueIds.push(...extractUniqueIds(msg.content))
  }

  // 查询插图（使用对话所有者的 userId）
  const illustrations: Record<string, string> = {}
  for (const uniqueId of allUniqueIds) {
    const task = await taskService.findByUniqueId(uniqueId, result.conversation.userId)
    if (task?.resourceUrl && task.status === 'success') {
      illustrations[uniqueId] = task.resourceUrl
    }
  }

  return {
    conversation: {
      title: result.conversation.title,
      createdAt: result.conversation.createdAt,
      updatedAt: result.conversation.updatedAt,
    },
    messages: result.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    assistant: assistant ? {
      name: assistant.name,
    } : null,
    illustrations,
  }
})

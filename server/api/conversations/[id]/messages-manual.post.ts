// POST /api/conversations/[id]/messages-manual - 手动添加消息（不触发AI回复）
import { useConversationService } from '../../../services/conversation'

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
  const { content, role } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, message: '消息内容不能为空' })
  }

  if (!['user', 'assistant'].includes(role)) {
    throw createError({ statusCode: 400, message: '无效的消息角色' })
  }

  // 获取对话
  const conversationService = useConversationService()
  const result = await conversationService.getById(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 保存消息
  const message = await conversationService.addMessage({
    conversationId,
    role,
    content: content.trim(),
  })

  return message
})

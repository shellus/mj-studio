// GET /api/conversations/[id]/streaming - 获取进行中的流式内容
// 兼容旧 API，新系统通过消息 status 字段判断
import { findActiveSession } from '../../../services/streamingCache'

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

  // 使用兼容函数查找活跃会话
  const session = findActiveSession(conversationId, user.id)

  if (!session) {
    return { streaming: false, content: '' }
  }

  return {
    streaming: true,
    content: session.content,
    startedAt: session.startedAt,
    messageId: session.messageId,
  }
})

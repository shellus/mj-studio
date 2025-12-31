// GET /api/conversations/[id] - 获取对话详情（含消息）
import { useConversationService } from '../../services/conversation'
import { getStreamingSession } from '../../services/streamingCache'

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

  const service = useConversationService()
  const result = await service.getWithMessages(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  // 验证权限
  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 补充正在流式输出的消息内容
  // 流式输出完成前内容只存在于内存缓存中，数据库中为空
  // 这里从缓存中获取已累积的内容，确保新打开的窗口能看到完整内容
  for (const msg of result.messages) {
    if (msg.role === 'assistant' &&
        (msg.status === 'created' || msg.status === 'pending' || msg.status === 'streaming') &&
        !msg.content) {
      const session = getStreamingSession(msg.id)
      if (session?.content) {
        msg.content = session.content
      }
    }
  }

  return result
})

// GET /api/messages/[id]/stream - 订阅单个消息的流式输出
import { useConversationService } from '../../../services/conversation'
import { getStreamingSession } from '../../../services/streamingCache'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '消息ID不能为空' })
  }

  const messageId = parseInt(id, 10)
  if (isNaN(messageId)) {
    throw createError({ statusCode: 400, message: '无效的消息ID' })
  }

  // 查询消息并验证权限
  const service = useConversationService()
  const message = await service.getMessageById(messageId)

  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  // 通过对话验证权限
  const conversation = await service.getById(message.conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此消息' })
  }

  // 获取流式会话
  const session = getStreamingSession(messageId)
  if (!session) {
    throw createError({ statusCode: 404, message: '流式会话不存在或已结束' })
  }

  // 设置 SSE 响应头
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  // 创建流
  const stream = createEventStream(event)

  // 注册到会话的订阅者列表
  if (!session.streams) {
    session.streams = new Set()
  }
  session.streams.add(stream)

  // 连接关闭时清理
  event.node.req.on('close', () => {
    session.streams?.delete(stream)
  })

  return stream.send()
})

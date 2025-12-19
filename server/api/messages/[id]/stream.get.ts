// GET /api/messages/[id]/stream - SSE 订阅消息流式输出
// 订阅指定 AI 消息的流式输出
import { useConversationService } from '../../../services/conversation'
import {
  getStreamingSession,
  addSubscriber,
  removeSubscriber,
} from '../../../services/streamingCache'

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

  // 获取消息
  const conversationService = useConversationService()
  const message = await conversationService.getMessageById(messageId)

  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  // 验证权限：消息所属对话必须属于当前用户
  const conversation = await conversationService.getById(message.conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此消息' })
  }

  // 只有 AI 消息可以订阅
  if (message.role !== 'assistant') {
    throw createError({ statusCode: 400, message: '只能订阅 AI 消息' })
  }

  // 设置 SSE 响应头
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  // 检查消息状态
  const status = message.status

  // 如果消息已完成（completed/stopped/failed），直接返回完整内容
  if (status === 'completed' || status === 'stopped' || status === 'failed') {
    // 如果有内容，发送完整内容
    if (message.content) {
      const contentData = JSON.stringify({ content: message.content, done: false })
      await event.node.res.write(`data: ${contentData}\n\n`)
    }

    // 发送完成信号
    const doneData = JSON.stringify({
      done: true,
      status: status || 'completed',
      ...(status === 'failed' && message.mark === 'error' ? { error: message.content } : {}),
    })
    await event.node.res.write(`data: ${doneData}\n\n`)
    await event.node.res.end()
    return
  }

  // 消息正在生成中（created/pending/streaming）
  // 添加为订阅者
  addSubscriber(messageId, event, user.id)

  // 如果有缓存内容，先发送已缓存的内容
  const session = getStreamingSession(messageId)
  if (session && session.content) {
    const contentData = JSON.stringify({ content: session.content, done: false })
    await event.node.res.write(`data: ${contentData}\n\n`)
  }

  // 等待连接关闭
  return new Promise((resolve) => {
    // 监听连接关闭
    event.node.req.on('close', () => {
      removeSubscriber(messageId, event)
      resolve(undefined)
    })

    event.node.req.on('error', () => {
      removeSubscriber(messageId, event)
      resolve(undefined)
    })
  })
})

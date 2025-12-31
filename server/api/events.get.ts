// GET /api/events - 全局 SSE 订阅端点
// 用户级事件流，登录后每个页面建立一条连接

import {
  addUserSubscriber,
  removeUserSubscriber,
  emitToUser,
} from '../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  // 设置 SSE 响应头
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲

  // 注册订阅
  addUserSubscriber(user.id, event)

  // 发送 hello 事件确认连接建立
  await emitToUser(user.id, 'system.hello', {
    userId: user.id,
    ts: Date.now(),
  })

  // 心跳定时器
  const heartbeatInterval = setInterval(async () => {
    try {
      await event.node.res.write(': ping\n\n')
    } catch {
      // 连接已断开
      clearInterval(heartbeatInterval)
    }
  }, 30 * 1000) // 每30秒发送一次心跳

  // 等待连接关闭
  return new Promise((resolve) => {
    const cleanup = () => {
      clearInterval(heartbeatInterval)
      removeUserSubscriber(user.id, event)
      resolve(undefined)
    }

    event.node.req.on('close', cleanup)
    event.node.req.on('error', cleanup)
  })
})

// 流式内容缓存服务
// 用于在流式响应过程中缓存内容，支持页面刷新后恢复

interface StreamingSession {
  conversationId: number
  userId: number
  content: string
  startedAt: number
  updatedAt: number
}

// 内存缓存
const streamingSessions = new Map<string, StreamingSession>()

// 生成缓存 key
function getCacheKey(conversationId: number, userId: number): string {
  return `streaming:${userId}:${conversationId}`
}

// 开始流式会话
export function startStreamingSession(conversationId: number, userId: number): void {
  const key = getCacheKey(conversationId, userId)
  streamingSessions.set(key, {
    conversationId,
    userId,
    content: '',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  })
}

// 追加内容到缓存
export function appendStreamingContent(conversationId: number, userId: number, content: string): void {
  const key = getCacheKey(conversationId, userId)
  const session = streamingSessions.get(key)
  if (session) {
    session.content += content
    session.updatedAt = Date.now()
  }
}

// 结束流式会话（清理缓存）
export function endStreamingSession(conversationId: number, userId: number): string {
  const key = getCacheKey(conversationId, userId)
  const session = streamingSessions.get(key)
  const content = session?.content || ''
  streamingSessions.delete(key)
  return content
}

// 获取流式会话内容（用于恢复）
export function getStreamingSession(conversationId: number, userId: number): StreamingSession | null {
  const key = getCacheKey(conversationId, userId)
  return streamingSessions.get(key) || null
}

// 检查是否有进行中的流式会话
export function hasStreamingSession(conversationId: number, userId: number): boolean {
  const key = getCacheKey(conversationId, userId)
  return streamingSessions.has(key)
}

// 清理超时的会话（超过5分钟视为超时）
export function cleanupStaleSessions(): void {
  const now = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutes

  for (const [key, session] of streamingSessions) {
    if (now - session.updatedAt > timeout) {
      streamingSessions.delete(key)
    }
  }
}

// 定期清理超时会话
setInterval(cleanupStaleSessions, 60 * 1000) // 每分钟清理一次

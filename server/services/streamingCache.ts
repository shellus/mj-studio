// 流式内容缓存服务
// 用于在流式响应过程中缓存内容，支持页面刷新后恢复
// 按规范使用消息 ID 作为 key，支持发布-订阅模式

import type { MessageStatus } from '../database/schema'
import type { H3Event } from 'h3'

interface StreamingSession {
  messageId: number           // AI 消息 ID
  conversationId: number
  userId: number
  content: string             // 已累积的流式内容
  status: MessageStatus       // 当前状态
  startedAt: number
  updatedAt: number
  abortController?: AbortController  // 用于中止上游请求
}

// SSE 订阅者
interface Subscriber {
  messageId: number
  event: H3Event
  userId: number
}

// 内存缓存：以消息 ID 为 key
const streamingSessions = new Map<number, StreamingSession>()

// 订阅者列表：以消息 ID 为 key
const subscribers = new Map<number, Set<Subscriber>>()

// ==================== 流式会话管理 ====================

// 开始流式会话
export function startStreamingSession(
  messageId: number,
  conversationId: number,
  userId: number,
  abortController?: AbortController
): void {
  streamingSessions.set(messageId, {
    messageId,
    conversationId,
    userId,
    content: '',
    status: 'created',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    abortController,
  })
}

// 更新会话状态
export function updateSessionStatus(messageId: number, status: MessageStatus): void {
  const session = streamingSessions.get(messageId)
  if (session) {
    session.status = status
    session.updatedAt = Date.now()
  }
}

// 追加内容到缓存
export function appendStreamingContent(messageId: number, content: string): void {
  const session = streamingSessions.get(messageId)
  if (session) {
    session.content += content
    session.updatedAt = Date.now()
  }
}

// 获取会话内容
export function getStreamingSession(messageId: number): StreamingSession | null {
  return streamingSessions.get(messageId) || null
}

// 检查是否有进行中的会话
export function hasStreamingSession(messageId: number): boolean {
  return streamingSessions.has(messageId)
}

// 结束流式会话（返回累积内容并清理）
export function endStreamingSession(messageId: number): string {
  const session = streamingSessions.get(messageId)
  const content = session?.content || ''
  streamingSessions.delete(messageId)
  return content
}

// 获取会话的 AbortController
export function getSessionAbortController(messageId: number): AbortController | undefined {
  return streamingSessions.get(messageId)?.abortController
}

// ==================== 订阅者管理（发布-订阅模式）====================

// 添加订阅者
export function addSubscriber(messageId: number, event: H3Event, userId: number): void {
  if (!subscribers.has(messageId)) {
    subscribers.set(messageId, new Set())
  }
  subscribers.get(messageId)!.add({ messageId, event, userId })
}

// 移除订阅者
export function removeSubscriber(messageId: number, event: H3Event): void {
  const subs = subscribers.get(messageId)
  if (subs) {
    for (const sub of subs) {
      if (sub.event === event) {
        subs.delete(sub)
        break
      }
    }
    if (subs.size === 0) {
      subscribers.delete(messageId)
    }
  }
}

// 向消息的所有订阅者广播内容
export async function broadcastToSubscribers(messageId: number, data: object): Promise<void> {
  const subs = subscribers.get(messageId)
  if (!subs || subs.size === 0) return

  const message = `data: ${JSON.stringify(data)}\n\n`

  for (const sub of subs) {
    try {
      await sub.event.node.res.write(message)
    } catch {
      // 连接已断开，移除订阅者
      subs.delete(sub)
    }
  }
}

// 获取订阅者数量
export function getSubscriberCount(messageId: number): number {
  return subscribers.get(messageId)?.size || 0
}

// ==================== 清理 ====================

// 清理超时的会话（超过5分钟视为超时）
export function cleanupStaleSessions(): void {
  const now = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutes

  for (const [messageId, session] of streamingSessions) {
    if (now - session.updatedAt > timeout) {
      // 中止上游请求
      session.abortController?.abort()
      streamingSessions.delete(messageId)
      // 清理订阅者
      subscribers.delete(messageId)
    }
  }
}

// 定期清理超时会话
setInterval(cleanupStaleSessions, 60 * 1000) // 每分钟清理一次

// ==================== 兼容旧 API（按 conversationId + userId）====================
// 这些函数用于向后兼容，新代码应使用上面的函数

// 根据 conversationId 和 userId 查找活跃的流式会话
export function findActiveSession(conversationId: number, userId: number): StreamingSession | null {
  for (const session of streamingSessions.values()) {
    if (session.conversationId === conversationId && session.userId === userId) {
      return session
    }
  }
  return null
}

// 检查对话是否有进行中的流式
export function hasActiveStreamingForConversation(conversationId: number, userId: number): boolean {
  return findActiveSession(conversationId, userId) !== null
}

// 获取对话的流式内容
export function getStreamingContentForConversation(conversationId: number, userId: number): string {
  const session = findActiveSession(conversationId, userId)
  return session?.content || ''
}

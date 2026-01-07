// 流式内容缓存服务
// 用于在流式响应过程中缓存内容，支持中止和恢复

import type { MessageStatus } from '../database/schema'
import type { EventStream } from 'h3'

interface StreamingSession {
  messageId: number           // AI 消息 ID
  conversationId: number
  userId: number
  content: string             // 已累积的流式内容
  status: MessageStatus       // 当前状态
  startedAt: number
  updatedAt: number
  abortController?: AbortController  // 用于中止上游请求
  streams?: Set<EventStream>  // 订阅此消息流的 SSE 连接
}

// 内存缓存：以消息 ID 为 key
const streamingSessions = new Map<number, StreamingSession>()

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

// 追加内容到缓存并广播给订阅者
export function appendStreamingContent(messageId: number, content: string): void {
  const session = streamingSessions.get(messageId)
  if (session) {
    session.content += content
    session.updatedAt = Date.now()

    // 广播给所有订阅者
    if (session.streams) {
      for (const stream of session.streams) {
        try {
          // 使用 JSON.stringify 编码，处理换行符等特殊字符
          stream.push(JSON.stringify(content))
        } catch (err) {
          // 连接已断开，从订阅列表移除
          session.streams.delete(stream)
        }
      }
    }
  }
}

// 获取会话内容
export function getStreamingSession(messageId: number): StreamingSession | null {
  return streamingSessions.get(messageId) || null
}

// 获取会话内容（仅内容字符串）
export function getStreamingContent(messageId: number): string {
  return streamingSessions.get(messageId)?.content || ''
}

// 检查是否有进行中的会话
export function hasStreamingSession(messageId: number): boolean {
  return streamingSessions.has(messageId)
}

// 结束流式会话（通知所有订阅者后清理）
export function endStreamingSession(messageId: number): string {
  const session = streamingSessions.get(messageId)
  const content = session?.content || ''

  // 关闭所有订阅流
  if (session?.streams) {
    for (const stream of session.streams) {
      try {
        stream.close()  // 关闭 SSE 连接
      } catch (err) {
        // 忽略关闭错误
      }
    }
  }

  streamingSessions.delete(messageId)
  return content
}

// 获取会话的 AbortController
export function getSessionAbortController(messageId: number): AbortController | undefined {
  return streamingSessions.get(messageId)?.abortController
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

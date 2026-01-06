// 全局事件 Hub（内存版）
// 用户级 SSE 订阅管理，支持向用户的所有终端/标签页广播事件

import type { H3Event } from 'h3'

// 事件包络类型
export interface GlobalEventEnvelope<T = unknown> {
  id: string
  ts: number
  type: string
  data: T
}

// 消息事件类型
export interface ChatMessageCreated {
  conversationId: number
  message: {
    id: number
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    files: any[] | null
    modelDisplayName?: string | null  // 模型显示名称
    status: 'created' | 'pending' | 'streaming' | 'completed' | 'stopped' | 'failed' | null
    mark: string | null
    sortId: number | null
    createdAt?: string
    updatedAt?: string
  }
}

// ChatMessageDelta 已废弃，流式增量内容通过独立端点 GET /api/messages/[id]/stream 订阅

export interface ChatMessageDone {
  conversationId: number
  messageId: number
  status: 'completed' | 'stopped' | 'failed'
  error?: string
  estimatedTime?: number
  upstreamId?: number
  aimodelId?: number
}

// 对话事件类型
export interface ChatConversationCreated {
  conversation: {
    id: number
    userId: number
    assistantId: number
    title: string
    createdAt: string
    updatedAt: string
  }
}

export interface ChatConversationDeleted {
  conversationId: number
  assistantId: number
}

export interface ChatConversationUpdated {
  conversation: {
    id: number
    title: string
    updatedAt: string
  }
}

export interface ChatMessageDeleted {
  conversationId: number
  messageId: number
}

export interface ChatMessageUpdated {
  conversationId: number
  message: {
    id: number
    content: string
    updatedAt: string
  }
}

export interface ChatMessagesDeleted {
  conversationId: number
  messageIds: number[]
}

// 绘图/视频任务事件类型
export interface TaskCreated {
  task: {
    id: number
    userId: number
    taskType: 'image' | 'video'
    modelType: string
    prompt: string
    status: string
    createdAt: string
  }
}

export interface TaskStatusUpdated {
  taskId: number
  status: string
  progress?: number
  resourceUrl?: string | null
  error?: string | null
  buttons?: any[] | null
  updatedAt: string
}

export interface TaskDeleted {
  taskId: number
}

export interface TaskRestored {
  taskId: number
}

export interface TaskBlurUpdated {
  taskId: number
  isBlurred: boolean
}

export interface TasksBlurUpdated {
  taskIds: number[]
  isBlurred: boolean
}

// SSE 连接
interface SSEConnection {
  event: H3Event
  createdAt: number
}

// 用户 -> 连接集合
const userSubscribers = new Map<number, Set<SSEConnection>>()

// 事件 ID 生成器（简单自增，单进程内唯一）
let eventIdCounter = 0
function generateEventId(): string {
  return `${Date.now()}-${++eventIdCounter}`
}

// 添加用户订阅
export function addUserSubscriber(userId: number, event: H3Event): void {
  if (!userSubscribers.has(userId)) {
    userSubscribers.set(userId, new Set())
  }
  userSubscribers.get(userId)!.add({
    event,
    createdAt: Date.now(),
  })
}

// 移除用户订阅
export function removeUserSubscriber(userId: number, event: H3Event): void {
  const connections = userSubscribers.get(userId)
  if (connections) {
    for (const conn of connections) {
      if (conn.event === event) {
        connections.delete(conn)
        break
      }
    }
    if (connections.size === 0) {
      userSubscribers.delete(userId)
    }
  }
}

// 向用户的所有连接广播事件
export async function emitToUser<T>(
  userId: number,
  eventType: string,
  data: T
): Promise<void> {
  const connections = userSubscribers.get(userId)
  if (!connections || connections.size === 0) return

  const envelope: GlobalEventEnvelope<T> = {
    id: generateEventId(),
    ts: Date.now(),
    type: eventType,
    data,
  }

  // SSE 格式：id + event + data
  const message = [
    `id: ${envelope.id}`,
    `event: ${eventType}`,
    `data: ${JSON.stringify(envelope)}`,
    '',
    '',
  ].join('\n')

  for (const conn of connections) {
    try {
      await conn.event.node.res.write(message)
    } catch {
      // 连接已断开，移除
      connections.delete(conn)
    }
  }
}

// 向多个用户广播（为多人会话预留）
export async function emitToUsers<T>(
  userIds: number[],
  eventType: string,
  data: T
): Promise<void> {
  await Promise.all(userIds.map(userId => emitToUser(userId, eventType, data)))
}

// 获取用户的连接数（用于调试）
export function getUserConnectionCount(userId: number): number {
  return userSubscribers.get(userId)?.size || 0
}

// 获取总连接数（用于调试）
export function getTotalConnectionCount(): number {
  let total = 0
  for (const connections of userSubscribers.values()) {
    total += connections.size
  }
  return total
}

// 清理超时连接（超过30分钟视为超时）
export function cleanupStaleConnections(): void {
  const now = Date.now()
  const timeout = 30 * 60 * 1000 // 30 minutes

  for (const [userId, connections] of userSubscribers) {
    for (const conn of connections) {
      if (now - conn.createdAt > timeout) {
        try {
          conn.event.node.res.end()
        } catch {
          // ignore
        }
        connections.delete(conn)
      }
    }
    if (connections.size === 0) {
      userSubscribers.delete(userId)
    }
  }
}

// 定期清理超时连接
setInterval(cleanupStaleConnections, 5 * 60 * 1000) // 每5分钟清理一次

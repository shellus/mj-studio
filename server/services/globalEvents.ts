// 全局事件 Hub（内存版）
// 用户级 SSE 订阅管理，支持向用户的所有终端/标签页广播事件

import type { H3Event } from 'h3'

// 从共享模块导入事件类型
export type {
  GlobalEventEnvelope,
  ChatMessageCreated,
  ChatMessageDone,
  ChatMessageDeleted,
  ChatMessageUpdated,
  ChatMessagesDeleted,
  ChatConversationCreated,
  ChatConversationDeleted,
  ChatConversationUpdated,
  ChatAssistantUpdated,
  TaskCreated,
  TaskStatusUpdated,
  TaskDeleted,
  TaskRestored,
  TaskBlurUpdated,
  TasksBlurUpdated,
  MJButton,
} from '../../app/shared/events'

import type { GlobalEventEnvelope } from '../../app/shared/events'

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

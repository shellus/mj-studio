/**
 * 工具调用确认状态管理
 *
 * 管理等待用户确认的工具调用，存储 Promise resolve/reject 回调
 * 工具调用的完整状态信息存储在数据库的 assistant 消息 toolCalls 字段中
 */

import type { AssistantToolCallUpdated } from '../../app/shared/events'
import type { ToolCallRecord } from '../../app/shared/types'
import { emitToUser } from './globalEvents'

interface PendingToolCall {
  messageId: number
  toolCallId: string
  resolve: (approved: boolean) => void
  createdAt: number
}

// 存储等待确认的工具调用
const pendingToolCalls = new Map<string, PendingToolCall>()

// 生成唯一 key
function getKey(messageId: number, toolCallId: string): string {
  return `${messageId}:${toolCallId}`
}

/**
 * 等待用户确认工具调用
 * @returns Promise<boolean> - true 表示批准，false 表示拒绝
 */
export function waitForToolConfirmation(
  messageId: number,
  toolCallId: string
): Promise<boolean> {
  const key = getKey(messageId, toolCallId)

  return new Promise((resolve) => {
    pendingToolCalls.set(key, {
      messageId,
      toolCallId,
      resolve,
      createdAt: Date.now(),
    })
  })
}

/**
 * 确认或拒绝工具调用
 * @returns boolean - 是否找到并处理了该工具调用
 */
export function confirmToolCall(
  messageId: number,
  toolCallId: string,
  approved: boolean
): boolean {
  const key = getKey(messageId, toolCallId)
  const pending = pendingToolCalls.get(key)

  if (!pending) {
    return false
  }

  pending.resolve(approved)
  pendingToolCalls.delete(key)
  return true
}

/**
 * 检查工具调用是否在等待确认中
 */
export function isToolCallPending(
  messageId: number,
  toolCallId: string
): boolean {
  const key = getKey(messageId, toolCallId)
  return pendingToolCalls.has(key)
}

/**
 * 取消消息的所有待确认工具调用
 */
export function cancelPendingToolCalls(messageId: number): void {
  for (const [key, pending] of pendingToolCalls) {
    if (pending.messageId === messageId) {
      pending.resolve(false)
      pendingToolCalls.delete(key)
    }
  }
}

/**
 * 清理超时的待确认（5分钟）
 */
export function cleanupExpiredToolCalls(): void {
  const now = Date.now()
  const timeout = 5 * 60 * 1000

  for (const [key, pending] of pendingToolCalls) {
    if (now - pending.createdAt > timeout) {
      pending.resolve(false)
      pendingToolCalls.delete(key)
    }
  }
}

// 每分钟清理一次
setInterval(cleanupExpiredToolCalls, 60 * 1000)

/**
 * 广播单个工具调用状态更新事件（精细粒度）
 * - 当 assistant 消息中的某个工具调用状态变化时调用
 */
export function broadcastToolCallUpdated(
  userId: number,
  conversationId: number,
  messageId: number,
  toolCallId: string,
  toolCall: ToolCallRecord
): void {
  emitToUser<AssistantToolCallUpdated>(userId, 'assistant.toolCall.updated', {
    conversationId,
    messageId,
    toolCallId,
    toolCall,
  })
}

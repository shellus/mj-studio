/**
 * 工具调用确认状态管理
 *
 * 管理等待用户确认的工具调用，存储 Promise resolve/reject 回调
 * 同时维护工具调用的完整状态信息，用于前端查询和 SSE 广播
 */

import type { ToolCallEventStatus, ToolCallStatusUpdated } from '../../app/shared/events'
import { emitToUser } from './globalEvents'

interface PendingToolCall {
  messageId: number
  toolCallId: string
  resolve: (approved: boolean) => void
  createdAt: number
}

/** 工具调用完整状态信息 */
export interface ToolCallStateInfo {
  messageId: number
  toolCallId: string
  status: ToolCallEventStatus
  serverName: string
  toolName: string
  arguments: Record<string, unknown>
  response?: unknown
  isError?: boolean
  createdAt: number
  updatedAt: number
}

// 存储等待确认的工具调用
const pendingToolCalls = new Map<string, PendingToolCall>()

// 存储工具调用的完整状态信息
const toolCallStates = new Map<string, ToolCallStateInfo>()

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
 * 注册工具调用状态（创建时调用）
 */
export function registerToolCallState(
  userId: number,
  messageId: number,
  toolCallId: string,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  status: ToolCallEventStatus = 'pending'
): void {
  const key = getKey(messageId, toolCallId)
  const now = Date.now()

  toolCallStates.set(key, {
    messageId,
    toolCallId,
    status,
    serverName,
    toolName,
    arguments: args,
    createdAt: now,
    updatedAt: now,
  })

  // 广播状态事件
  broadcastToolCallStatus(userId, messageId, toolCallId)
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
 * 更新工具调用状态并广播
 */
export function updateToolCallStatus(
  userId: number,
  messageId: number,
  toolCallId: string,
  status: ToolCallEventStatus,
  response?: unknown,
  isError?: boolean
): void {
  const key = getKey(messageId, toolCallId)
  const state = toolCallStates.get(key)

  if (state) {
    state.status = status
    state.updatedAt = Date.now()
    if (response !== undefined) {
      state.response = response
    }
    if (isError !== undefined) {
      state.isError = isError
    }
  }

  // 广播状态事件
  broadcastToolCallStatus(userId, messageId, toolCallId)
}

/**
 * 获取工具调用状态
 */
export function getToolCallState(
  messageId: number,
  toolCallId: string
): ToolCallStateInfo | null {
  const key = getKey(messageId, toolCallId)
  return toolCallStates.get(key) || null
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
 * 广播工具调用状态更新事件
 */
function broadcastToolCallStatus(
  userId: number,
  messageId: number,
  toolCallId: string
): void {
  const state = getToolCallState(messageId, toolCallId)
  if (!state) return

  emitToUser<ToolCallStatusUpdated>(userId, 'tool.call.status.updated', {
    messageId: state.messageId,
    toolCallId: state.toolCallId,
    status: state.status,
    serverName: state.serverName,
    toolName: state.toolName,
    arguments: state.arguments,
    response: state.response,
    isError: state.isError,
  })
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
  // 同时清理状态信息
  for (const [key, state] of toolCallStates) {
    if (state.messageId === messageId) {
      toolCallStates.delete(key)
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
  // 同时清理超时的状态信息（10分钟）
  const stateTimeout = 10 * 60 * 1000
  for (const [key, state] of toolCallStates) {
    if (now - state.updatedAt > stateTimeout) {
      toolCallStates.delete(key)
    }
  }
}

// 每分钟清理一次
setInterval(cleanupExpiredToolCalls, 60 * 1000)

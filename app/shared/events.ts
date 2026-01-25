/**
 * 全局事件类型定义
 *
 * 本文件定义前后端共用的事件类型，用于 SSE 推送。
 * 服务端发送事件，前端订阅并处理。
 */

import type { MessageStatus, MessageMark, MessageFile, TaskType, MessageRole, ToolCallRecord } from './types'

// ==================== 事件包络 ====================

/**
 * 事件包络
 * - 所有 SSE 事件都包装在此结构中
 */
export interface GlobalEventEnvelope<T = unknown> {
  id: string
  ts: number
  type: string
  data: T
}

// ==================== 消息事件 ====================

/**
 * 消息创建事件
 */
export interface ChatMessageCreated {
  conversationId: number
  assistantId: number
  lastActiveAt: string
  message: {
    id: number
    conversationId: number
    role: MessageRole
    content: string
    files: MessageFile[] | null
    modelDisplayName?: string | null
    status: MessageStatus | null
    mark: MessageMark | null
    sortId: number | null
    createdAt?: string
    toolCalls?: ToolCallRecord[]
  }
}

/**
 * 消息完成事件（流式结束）
 */
export interface ChatMessageDone {
  conversationId: number
  messageId: number
  status: 'completed' | 'stopped' | 'failed'
  error?: string
  estimatedTime?: number
  upstreamId?: number
  aimodelId?: number
}

/**
 * 消息删除事件
 */
export interface ChatMessageDeleted {
  conversationId: number
  messageId: number
}

/**
 * 消息更新事件
 */
export interface ChatMessageUpdated {
  conversationId: number
  message: {
    id: number
    content: string
    updatedAt: string
  }
}

/**
 * 批量消息删除事件
 */
export interface ChatMessagesDeleted {
  conversationId: number
  messageIds: number[]
}

// ==================== 对话事件 ====================

/**
 * 对话创建事件
 */
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

/**
 * 对话删除事件
 */
export interface ChatConversationDeleted {
  conversationId: number
  assistantId: number
}

/**
 * 对话更新事件
 */
export interface ChatConversationUpdated {
  conversation: {
    id: number
    title: string
    updatedAt: string
  }
}

// ==================== 助手事件 ====================

/**
 * 助手更新事件
 */
export interface ChatAssistantUpdated {
  assistant: {
    id: number
    name: string
    description: string | null
    avatar: string | null
    systemPrompt: string | null
    aimodelId: number | null
    isDefault: boolean
    suggestions: string[] | null
    conversationCount: number
    enableThinking: boolean
    pinnedAt: Date | null
    lastActiveAt: Date | null
  }
}

// ==================== 任务事件 ====================

/**
 * MJ 按钮类型
 */
export interface MJButton {
  customId: string
  emoji: string
  label: string
  style: number
  type: number
}

/**
 * 任务创建事件
 */
export interface TaskCreated {
  task: {
    id: number
    userId: number
    taskType: TaskType
    modelType: string
    prompt: string
    status: string
    createdAt: string
  }
}

/**
 * 任务状态更新事件
 */
export interface TaskStatusUpdated {
  taskId: number
  status: string
  progress?: number
  resourceUrl?: string | null
  error?: string | null
  buttons?: MJButton[] | null
  updatedAt: string
  duration?: number
}

/**
 * 任务删除事件
 */
export interface TaskDeleted {
  taskId: number
}

/**
 * 任务恢复事件
 */
export interface TaskRestored {
  taskId: number
}

/**
 * 任务模糊状态更新事件
 */
export interface TaskBlurUpdated {
  taskId: number
  isBlurred: boolean
}

/**
 * 批量任务模糊状态更新事件
 */
export interface TasksBlurUpdated {
  taskIds: number[]
  isBlurred: boolean
}

// ==================== 工具调用事件 ====================

/**
 * 工具调用状态
 */
export type ToolCallEventStatus = 'pending' | 'invoking' | 'done' | 'error' | 'cancelled'

/**
 * 单个工具调用状态更新事件
 * - 当 assistant 消息中的某个工具调用状态变化时广播
 * - 精细粒度：每次只传递变化的那个工具
 */
export interface AssistantToolCallUpdated {
  conversationId: number
  messageId: number
  /** 变化的工具调用 ID */
  toolCallId: string
  /** 该工具的完整状态 */
  toolCall: ToolCallRecord
}

// ==================== 事件处理器类型 ====================

/**
 * 事件处理器
 */
export type GlobalEventHandler<T = unknown> = (data: T, envelope: GlobalEventEnvelope<T>) => void

/**
 * Chat Provider 接口层类型定义
 *
 * 统一对话服务的接口，支持同步和流式两种模式。
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { LogContext } from '../../utils/logger'

/** Chat API 格式类型 */
export type ChatApiFormat = 'openai-chat' | 'claude' | 'gemini'

/** Web Search 结果项 */
export interface WebSearchResultItem {
  url: string
  title: string
  pageAge?: string
}

/** 流式响应块 */
export interface ChatStreamChunk {
  content: string
  thinking?: string  // 思考/推理内容
  done: boolean
  /** Web Search 状态和结果 */
  webSearch?: {
    status: 'searching' | 'completed'
    results?: WebSearchResultItem[]
  }
}

/** 非流式响应结果 */
export interface ChatResult {
  success: boolean
  content?: string
  error?: string
}

/** 对话服务接口 */
export interface ChatService {
  /** 非流式对话（用于标题生成、压缩等） */
  chat(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext
  ): Promise<ChatResult>

  /** 流式对话（用于正常对话） */
  chatStream(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext,
    conversationId?: number,
    messageId?: number,
    enableThinking?: boolean,
    enableWebSearch?: boolean
  ): AsyncGenerator<ChatStreamChunk>
}

/** Chat Provider 配置 */
export interface ChatProvider {
  readonly apiFormat: ChatApiFormat
  readonly label: string
  createService(upstream: Upstream, keyName?: string): ChatService
}

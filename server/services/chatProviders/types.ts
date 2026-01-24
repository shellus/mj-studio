/**
 * Chat Provider 接口层类型定义
 *
 * 统一对话服务的接口，支持同步和流式两种模式。
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { LogContext } from '../../utils/logger'

/** Chat API 格式类型 */
export type ChatApiFormat = 'openai-chat' | 'openai-response' | 'claude' | 'gemini'

/** Web Search 结果项 */
export interface WebSearchResultItem {
  url: string
  title: string
  pageAge?: string
}

/** 工具调用请求（AI 请求调用工具时返回） */
export interface ToolUseRequest {
  id: string           // tool_use ID（用于回传结果）
  name: string         // 工具名称（mcp__serverName__toolName 格式）
  input: Record<string, unknown>  // 工具参数
}

/** 传给 AI 的工具定义 */
export interface ChatTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
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
  /** AI 请求调用的工具（需要处理后回传结果） */
  toolUse?: ToolUseRequest
  /** 本轮响应结束原因 */
  stopReason?: 'end_turn' | 'tool_use'
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
    userMessage?: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext,
    conversationId?: number,
    messageId?: number,
    enableThinking?: boolean,
    enableWebSearch?: boolean,
    tools?: ChatTool[]
  ): AsyncGenerator<ChatStreamChunk>
}

/** Chat Provider 配置 */
export interface ChatProvider {
  readonly apiFormat: ChatApiFormat
  readonly label: string
  createService(upstream: Upstream, keyName?: string): ChatService
}

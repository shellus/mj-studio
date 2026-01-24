/**
 * MCP 客户端服务类型定义
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServer } from '../../database/schema'

/** MCP 客户端连接状态 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** MCP 传输层类型 */
export type McpTransport = SSEClientTransport | StreamableHTTPClientTransport

/** MCP 工具原始定义（来自 SDK） */
export interface McpToolRaw {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** MCP 工具（带服务信息） */
export interface McpToolWithServer {
  serverId: number
  serverName: string
  name: string
  displayName: string
  description: string
  inputSchema: Record<string, unknown>
  isEnabled: boolean
  isAutoApprove: boolean
}

/** 工具调用请求 */
export interface ToolCallRequest {
  toolCallId: string
  serverId: number
  serverName: string
  toolName: string
  toolDisplayName: string
  toolDescription: string
  arguments: Record<string, unknown>
}

/** 工具调用结果 */
export interface ToolCallResult {
  success: boolean
  content?: unknown
  error?: string
}

/** MCP 客户端实例状态 */
export interface ClientInstanceState {
  client: Client
  transport: McpTransport
  server: McpServer
  status: ConnectionStatus
  toolsCache: McpToolWithServer[] | null
  toolsCacheTime: number | null
  lastActiveAt: number
  errorMessage?: string
}

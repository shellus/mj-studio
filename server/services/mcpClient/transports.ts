/**
 * MCP 传输层适配器
 *
 * 根据服务类型创建对应的传输层实例
 */

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServer } from '../../database/schema'
import type { McpTransport } from './types'

/**
 * 根据 URL 自动推断传输类型
 */
export function inferTransportType(url: string): 'sse' | 'streamableHttp' {
  return url.endsWith('/mcp') ? 'streamableHttp' : 'sse'
}

/**
 * 创建传输层实例
 */
export function createTransport(server: McpServer): McpTransport {
  if (!server.baseUrl) {
    throw new Error('MCP 服务未配置 URL')
  }

  // stdio 类型暂不支持
  if (server.type === 'stdio') {
    throw new Error('stdio 类型暂不支持，请使用 HTTP 类型')
  }

  const url = new URL(server.baseUrl)
  const headers = server.headers || {}

  // 根据类型创建传输层
  if (server.type === 'streamableHttp') {
    return new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
    })
  }

  // 默认使用 SSE
  return new SSEClientTransport(url, {
    requestInit: { headers },
  })
}

/**
 * 获取传输层描述（用于日志）
 */
export function getTransportDescription(server: McpServer): string {
  if (server.type === 'stdio') {
    return `stdio: ${server.command} ${server.args?.join(' ') || ''}`
  }
  return `${server.type}: ${server.baseUrl}`
}

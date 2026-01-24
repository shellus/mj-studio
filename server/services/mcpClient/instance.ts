/**
 * MCP 客户端实例
 *
 * 管理单个 MCP 服务的连接和工具调用
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpServer } from '../../database/schema'
import { createTransport, getTransportDescription } from './transports'
import { buildToolDisplayName, MCP_CLIENT_CONFIG } from './config'
import type {
  ConnectionStatus,
  McpToolWithServer,
  McpTransport,
  ToolCallResult,
} from './types'

export class McpClientInstance {
  private client: Client
  private transport: McpTransport | null = null
  private _status: ConnectionStatus = 'disconnected'
  private toolsCache: McpToolWithServer[] | null = null
  private toolsCacheTime: number | null = null
  private _lastActiveAt: number = Date.now()
  private _errorMessage?: string

  constructor(private server: McpServer) {
    this.client = new Client({
      name: 'mj-studio',
      version: '1.0.0',
    })
  }

  get status(): ConnectionStatus {
    return this._status
  }

  get lastActiveAt(): number {
    return this._lastActiveAt
  }

  get errorMessage(): string | undefined {
    return this._errorMessage
  }

  get serverId(): number {
    return this.server.id
  }

  get serverName(): string {
    return this.server.name
  }

  /**
   * 连接到 MCP 服务
   */
  async connect(): Promise<void> {
    if (this._status === 'connected') {
      return
    }

    this._status = 'connecting'
    this._errorMessage = undefined

    try {
      this.transport = createTransport(this.server)

      // 设置连接超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('连接超时')), MCP_CLIENT_CONFIG.connectionTimeout)
      })

      await Promise.race([
        this.client.connect(this.transport),
        timeoutPromise,
      ])

      this._status = 'connected'
      this._lastActiveAt = Date.now()
      console.log(`[MCP Client] 已连接: ${getTransportDescription(this.server)}`)
    } catch (error) {
      this._status = 'error'
      this._errorMessage = error instanceof Error ? error.message : '连接失败'
      console.error(`[MCP Client] 连接失败: ${this.server.name}`, error)
      throw error
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this._status === 'disconnected') {
      return
    }

    try {
      await this.client.close()
    } catch (error) {
      console.error(`[MCP Client] 断开连接失败: ${this.server.name}`, error)
    } finally {
      this._status = 'disconnected'
      this.transport = null
      this.toolsCache = null
      this.toolsCacheTime = null
    }
  }

  /**
   * 获取工具列表（带缓存）
   */
  async listTools(): Promise<McpToolWithServer[]> {
    this._lastActiveAt = Date.now()

    // 检查缓存
    if (
      this.toolsCache &&
      this.toolsCacheTime &&
      Date.now() - this.toolsCacheTime < MCP_CLIENT_CONFIG.toolsCacheTTL
    ) {
      return this.toolsCache
    }

    // 确保已连接
    if (this._status !== 'connected') {
      await this.connect()
    }

    try {
      const result = await this.client.listTools()

      this.toolsCache = (result.tools || []).map((tool) => ({
        serverId: this.server.id,
        serverName: this.server.name,
        name: tool.name,
        displayName: buildToolDisplayName(this.server.name, tool.name),
        description: tool.description || '',
        inputSchema: tool.inputSchema as Record<string, unknown>,
        isEnabled: !this.server.disabledTools.includes(tool.name),
        isAutoApprove: this.server.autoApproveTools.includes(tool.name),
      }))

      this.toolsCacheTime = Date.now()
      return this.toolsCache
    } catch (error) {
      console.error(`[MCP Client] 获取工具列表失败: ${this.server.name}`, error)
      throw error
    }
  }

  /**
   * 清除工具缓存
   */
  clearToolsCache(): void {
    this.toolsCache = null
    this.toolsCacheTime = null
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this._lastActiveAt = Date.now()

    // 确保已连接
    if (this._status !== 'connected') {
      await this.connect()
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      })

      // 处理结果
      if (result.isError) {
        return {
          success: false,
          error: this.extractTextContent(result.content),
        }
      }

      return {
        success: true,
        content: this.extractContent(result.content),
      }
    } catch (error) {
      console.error(`[MCP Client] 工具调用失败: ${this.server.name}/${toolName}`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '工具调用失败',
      }
    }
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(content: unknown): string {
    if (!Array.isArray(content)) return String(content)

    return content
      .filter((item: unknown) => (item as { type?: string }).type === 'text')
      .map((item: unknown) => (item as { text?: string }).text)
      .join('\n')
  }

  /**
   * 提取结果内容
   */
  private extractContent(content: unknown): unknown {
    if (!Array.isArray(content)) return content
    if (content.length === 1 && (content[0] as { type?: string }).type === 'text') {
      return (content[0] as { text?: string }).text
    }
    return content
  }
}

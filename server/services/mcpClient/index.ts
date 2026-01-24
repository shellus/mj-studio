/**
 * MCP 客户端管理器
 *
 * 服务端单例，管理所有用户的 MCP 连接池
 */

import { McpClientInstance } from './instance'
import { MCP_CLIENT_CONFIG } from './config'
import type { McpServer } from '../../database/schema'
import type { McpToolWithServer } from './types'
import type { ChatTool } from '../chatProviders/types'

// 导出类型
export * from './types'
export * from './config'

class MCPClientManager {
  private clients: Map<string, McpClientInstance> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanupTimer()
  }

  /**
   * 生成客户端 key
   */
  private getClientKey(userId: number, serverId: number): string {
    return `${userId}_${serverId}`
  }

  /**
   * 获取或创建客户端实例
   */
  async getClient(userId: number, server: McpServer): Promise<McpClientInstance> {
    const key = this.getClientKey(userId, server.id)

    let instance = this.clients.get(key)
    if (!instance) {
      instance = new McpClientInstance(server)
      this.clients.set(key, instance)
    }

    // 确保连接
    if (instance.status !== 'connected') {
      await instance.connect()
    }

    return instance
  }

  /**
   * 断开指定服务的连接
   */
  async disconnect(userId: number, serverId: number): Promise<void> {
    const key = this.getClientKey(userId, serverId)
    const instance = this.clients.get(key)

    if (instance) {
      await instance.disconnect()
      this.clients.delete(key)
    }
  }

  /**
   * 断开用户的所有连接
   */
  async disconnectAll(userId: number): Promise<void> {
    const keysToDelete: string[] = []

    for (const [key, instance] of this.clients) {
      if (key.startsWith(`${userId}_`)) {
        await instance.disconnect()
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.clients.delete(key))
  }

  /**
   * 获取多个服务的所有工具
   */
  async getToolsForServers(userId: number, servers: McpServer[]): Promise<McpToolWithServer[]> {
    const allTools: McpToolWithServer[] = []

    for (const server of servers) {
      if (!server.isActive) continue

      try {
        const client = await this.getClient(userId, server)
        const tools = await client.listTools()
        allTools.push(...tools.filter(t => t.isEnabled))
      } catch (error) {
        console.error(`[MCP Client] 获取工具失败: ${server.name}`, error)
        // 继续处理其他服务
      }
    }

    return allTools
  }

  /**
   * 调用工具
   */
  async callTool(
    userId: number,
    server: McpServer,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; content?: unknown; error?: string }> {
    const client = await this.getClient(userId, server)
    return client.callTool(toolName, args)
  }

  /**
   * 测试服务连接
   */
  async testConnection(userId: number, server: McpServer): Promise<{
    success: boolean
    error?: string
    toolCount?: number
  }> {
    try {
      const client = await this.getClient(userId, server)
      const tools = await client.listTools()

      return {
        success: true,
        toolCount: tools.length,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接失败',
      }
    }
  }

  /**
   * 清除服务的工具缓存
   */
  clearToolsCache(userId: number, serverId: number): void {
    const key = this.getClientKey(userId, serverId)
    const instance = this.clients.get(key)
    if (instance) {
      instance.clearToolsCache()
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return

    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections()
    }, MCP_CLIENT_CONFIG.cleanupInterval)
  }

  /**
   * 清理空闲连接
   */
  private cleanupIdleConnections(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, instance] of this.clients) {
      if (now - instance.lastActiveAt > MCP_CLIENT_CONFIG.maxIdleTime) {
        instance.disconnect().catch(console.error)
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.clients.delete(key))

    if (keysToDelete.length > 0) {
      console.log(`[MCP Client] 清理了 ${keysToDelete.length} 个空闲连接`)
    }
  }

  /**
   * 获取连接统计
   */
  getStats(): { totalConnections: number; connectedCount: number } {
    let connectedCount = 0
    for (const instance of this.clients.values()) {
      if (instance.status === 'connected') {
        connectedCount++
      }
    }

    return {
      totalConnections: this.clients.size,
      connectedCount,
    }
  }
}

// 导出单例
export const mcpClientManager = new MCPClientManager()

// 便捷函数
export function useMcpClientManager(): MCPClientManager {
  return mcpClientManager
}

/**
 * 将 MCP 工具转换为 ChatTool 格式
 */
export function mcpToolsToChatTools(tools: McpToolWithServer[]): ChatTool[] {
  return tools.map(t => ({
    name: t.displayName,
    description: t.description || `Tool: ${t.name}`,
    inputSchema: t.inputSchema,
  }))
}

/**
 * 根据 displayName 查找 MCP 工具
 */
export function findMcpToolByDisplayName(
  tools: McpToolWithServer[],
  displayName: string
): McpToolWithServer | undefined {
  return tools.find(t => t.displayName === displayName)
}

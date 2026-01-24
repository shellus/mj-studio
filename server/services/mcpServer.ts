/**
 * MCP 服务配置 Service
 *
 * 管理用户级 MCP 服务配置的 CRUD 操作
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../database'
import { mcpServers, assistantMcpServers, type McpServer, type NewMcpServer } from '../database/schema'
import { useMcpClientManager } from './mcpClient'

export function useMcpServerService() {
  const clientManager = useMcpClientManager()

  return {
    /**
     * 获取用户的所有 MCP 服务
     */
    async getByUserId(userId: number): Promise<McpServer[]> {
      return db.select().from(mcpServers).where(eq(mcpServers.userId, userId))
    },

    /**
     * 根据 ID 获取 MCP 服务
     */
    async getById(id: number, userId: number): Promise<McpServer | null> {
      const results = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
        .limit(1)

      return results[0] || null
    },

    /**
     * 创建 MCP 服务
     */
    async create(data: NewMcpServer): Promise<McpServer> {
      const results = await db.insert(mcpServers).values(data).returning()
      return results[0]!
    },

    /**
     * 更新 MCP 服务
     */
    async update(
      id: number,
      userId: number,
      data: Partial<Omit<NewMcpServer, 'id' | 'userId' | 'createdAt'>>
    ): Promise<McpServer | null> {
      // 断开旧连接
      clientManager.disconnect(userId, id).catch(console.error)

      const results = await db
        .update(mcpServers)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
        .returning()

      return results[0] || null
    },

    /**
     * 删除 MCP 服务
     */
    async delete(id: number, userId: number): Promise<boolean> {
      // 断开连接
      clientManager.disconnect(userId, id).catch(console.error)

      const results = await db
        .delete(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
        .returning()

      return results.length > 0
    },

    /**
     * 获取助手关联的 MCP 服务
     */
    async getByAssistantId(assistantId: number, userId: number): Promise<McpServer[]> {
      const relations = await db
        .select({ mcpServerId: assistantMcpServers.mcpServerId })
        .from(assistantMcpServers)
        .where(eq(assistantMcpServers.assistantId, assistantId))

      if (relations.length === 0) return []

      const serverIds = relations.map((r: { mcpServerId: number }) => r.mcpServerId)

      return db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.userId, userId))
        .then((servers: McpServer[]) => servers.filter(s => serverIds.includes(s.id)))
    },

    /**
     * 设置助手关联的 MCP 服务
     */
    async setAssistantServers(assistantId: number, serverIds: number[]): Promise<void> {
      // 先删除现有关联
      await db
        .delete(assistantMcpServers)
        .where(eq(assistantMcpServers.assistantId, assistantId))

      // 添加新关联
      if (serverIds.length > 0) {
        await db.insert(assistantMcpServers).values(
          serverIds.map(mcpServerId => ({
            assistantId,
            mcpServerId,
          }))
        )
      }
    },

    /**
     * 获取助手关联的服务 ID 列表
     */
    async getAssistantServerIds(assistantId: number): Promise<number[]> {
      const relations = await db
        .select({ mcpServerId: assistantMcpServers.mcpServerId })
        .from(assistantMcpServers)
        .where(eq(assistantMcpServers.assistantId, assistantId))

      return relations.map(r => r.mcpServerId)
    },

    /**
     * 批量导入 MCP 服务
     */
    async importServers(userId: number, servers: Omit<NewMcpServer, 'userId'>[]): Promise<McpServer[]> {
      const toInsert = servers.map(s => ({ ...s, userId }))
      return db.insert(mcpServers).values(toInsert).returning()
    },
  }
}

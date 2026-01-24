/**
 * MCP 客户端配置
 */

export const MCP_CLIENT_CONFIG = {
  /** 连接超时时间（毫秒） */
  connectionTimeout: 30 * 1000,

  /** 工具列表缓存时间（毫秒） */
  toolsCacheTTL: 5 * 60 * 1000,

  /** 空闲连接最大存活时间（毫秒） */
  maxIdleTime: 30 * 60 * 1000,

  /** 连接池清理间隔（毫秒） */
  cleanupInterval: 5 * 60 * 1000,

  /** 默认工具调用超时（秒） */
  defaultToolTimeout: 60,

  /** 工具名称最大长度 */
  maxToolNameLength: 63,

  /** 单次对话最大工具调用轮次 */
  maxToolRounds: 20,
}

/**
 * 构建 MCP 工具显示名称
 * 格式: mcp__{serverName}__{toolName}
 */
export function buildToolDisplayName(serverName: string, toolName: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  const name = `mcp__${sanitize(serverName)}__${sanitize(toolName)}`
  return name.slice(0, MCP_CLIENT_CONFIG.maxToolNameLength)
}

/**
 * 从显示名称解析服务名和工具名
 */
export function parseToolDisplayName(displayName: string): { serverName: string; toolName: string } | null {
  const match = displayName.match(/^mcp__([^_]+)__(.+)$/)
  if (!match) return null
  return { serverName: match[1]!, toolName: match[2]! }
}

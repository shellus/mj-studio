/**
 * MCP 服务管理 Composable
 */
import type { McpServerDisplay, McpTool } from '~/shared/types'

interface McpServerResponse {
  id: number
  name: string
  description: string | null
  type: 'sse' | 'streamableHttp' | 'stdio'
  isActive: boolean
  baseUrl: string | null
  timeout: number
  disabledTools: string[]
  autoApproveTools: string[]
  logoUrl: string | null
}

export function useMcpServers() {
  const servers = useState<McpServerDisplay[]>('mcp-servers', () => [])
  const isLoading = useState('mcp-servers-loading', () => false)
  const error = useState<string | null>('mcp-servers-error', () => null)

  /**
   * 获取服务列表
   */
  async function fetchServers(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const { servers: data } = await $fetch<{ servers: McpServerResponse[] }>('/api/mcp-servers')
      servers.value = data.map(s => ({
        ...s,
        connectionStatus: undefined,
        tools: undefined,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取服务列表失败'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 创建服务
   */
  async function createServer(data: {
    name: string
    description?: string
    type?: 'sse' | 'streamableHttp' | 'stdio'
    baseUrl?: string
    headers?: Record<string, string>
    timeout?: number
    logoUrl?: string
  }): Promise<McpServerDisplay | null> {
    const { server } = await $fetch<{ server: McpServerResponse }>('/api/mcp-servers', {
      method: 'POST',
      body: data,
    })
    const display: McpServerDisplay = { ...server, connectionStatus: undefined, tools: undefined }
    servers.value.push(display)
    return display
  }

  /**
   * 更新服务
   */
  async function updateServer(
    id: number,
    data: Partial<McpServerResponse>
  ): Promise<McpServerDisplay | null> {
    const { server } = await $fetch<{ server: McpServerResponse }>(`/api/mcp-servers/${id}`, {
      method: 'PUT',
      body: data,
    })
    const index = servers.value.findIndex(s => s.id === id)
    if (index !== -1) {
      servers.value[index] = { ...servers.value[index]!, ...server }
    }
    return servers.value[index] || null
  }

  /**
   * 删除服务
   */
  async function deleteServer(id: number): Promise<boolean> {
    await $fetch(`/api/mcp-servers/${id}`, { method: 'DELETE' })
    servers.value = servers.value.filter(s => s.id !== id)
    return true
  }

  /**
   * 测试连接
   */
  async function testConnection(id: number): Promise<{ success: boolean; error?: string; toolCount?: number }> {
    const server = servers.value.find(s => s.id === id)
    if (server) {
      server.connectionStatus = 'connecting'
    }

    try {
      const result = await $fetch<{ success: boolean; error?: string; toolCount?: number }>(
        `/api/mcp-servers/${id}/connect`,
        { method: 'POST' }
      )

      if (server) {
        server.connectionStatus = result.success ? 'connected' : 'error'
        if (result.toolCount !== undefined) {
          server.toolCount = result.toolCount
        }
      }

      return result
    } catch (e) {
      if (server) {
        server.connectionStatus = 'error'
      }
      throw e
    }
  }

  /**
   * 获取工具列表
   */
  async function fetchTools(id: number, refresh = false): Promise<McpTool[]> {
    const { tools } = await $fetch<{ tools: McpTool[] }>(
      `/api/mcp-servers/${id}/tools`,
      { query: { refresh } }
    )

    const server = servers.value.find(s => s.id === id)
    if (server) {
      server.tools = tools
      server.toolCount = tools.length
    }

    return tools
  }

  return {
    servers,
    isLoading,
    error,
    fetchServers,
    createServer,
    updateServer,
    deleteServer,
    testConnection,
    fetchTools,
  }
}

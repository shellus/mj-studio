/**
 * GET /api/mcp-servers/[id]/tools
 * 获取 MCP 服务的工具列表
 */
import { useMcpServerService } from '../../../services/mcpServer'
import { useMcpClientManager } from '../../../services/mcpClient'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))
  const refresh = getQuery(event).refresh === 'true'

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的 ID' })
  }

  const serverService = useMcpServerService()
  const server = await serverService.getById(id, user.id)

  if (!server) {
    throw createError({ statusCode: 404, message: '服务不存在' })
  }

  const clientManager = useMcpClientManager()

  // 如果需要刷新，清除缓存
  if (refresh) {
    clientManager.clearToolsCache(user.id, id)
  }

  try {
    const client = await clientManager.getClient(user.id, server)
    const tools = await client.listTools()

    return { tools }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : '获取工具列表失败',
    })
  }
})

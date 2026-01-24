/**
 * POST /api/mcp-servers/[id]/connect
 * 测试 MCP 服务连接
 */
import { useMcpServerService } from '../../../services/mcpServer'
import { useMcpClientManager } from '../../../services/mcpClient'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的 ID' })
  }

  const serverService = useMcpServerService()
  const server = await serverService.getById(id, user.id)

  if (!server) {
    throw createError({ statusCode: 404, message: '服务不存在' })
  }

  const clientManager = useMcpClientManager()
  const result = await clientManager.testConnection(user.id, server)

  return result
})

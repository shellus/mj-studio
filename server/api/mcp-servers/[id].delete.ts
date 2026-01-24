/**
 * DELETE /api/mcp-servers/[id]
 * 删除 MCP 服务
 */
import { useMcpServerService } from '../../services/mcpServer'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的 ID' })
  }

  const service = useMcpServerService()
  const deleted = await service.delete(id, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '服务不存在' })
  }

  return { success: true }
})

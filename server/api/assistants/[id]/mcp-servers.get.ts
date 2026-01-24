/**
 * GET /api/assistants/[id]/mcp-servers
 * 获取助手关联的 MCP 服务 ID 列表
 */
import { useMcpServerService } from '../../../services/mcpServer'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的 ID' })
  }

  const service = useMcpServerService()
  const serverIds = await service.getAssistantServerIds(id)

  return { serverIds }
})

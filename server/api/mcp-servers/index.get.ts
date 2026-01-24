/**
 * GET /api/mcp-servers
 * 获取用户的 MCP 服务列表
 */
import { useMcpServerService } from '../../services/mcpServer'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const service = useMcpServerService()

  const servers = await service.getByUserId(user.id)

  return {
    servers: servers.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: s.type,
      isActive: s.isActive,
      baseUrl: s.baseUrl,
      timeout: s.timeout,
      disabledTools: s.disabledTools,
      autoApproveTools: s.autoApproveTools,
      logoUrl: s.logoUrl,
      command: s.command,
      args: s.args,
      env: s.env,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  }
})

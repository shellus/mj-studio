/**
 * PUT /api/mcp-servers/[id]
 * 更新 MCP 服务
 */
import { z } from 'zod'
import { useMcpServerService } from '../../services/mcpServer'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(['sse', 'streamableHttp', 'stdio']).optional(),
  isActive: z.boolean().optional(),
  baseUrl: z.string().url().optional().nullable(),
  headers: z.record(z.string(), z.string()).optional().nullable(),
  command: z.string().optional().nullable(),
  args: z.array(z.string()).optional().nullable(),
  env: z.record(z.string(), z.string()).optional().nullable(),
  timeout: z.number().min(1).max(600).optional(),
  disabledTools: z.array(z.string()).optional(),
  autoApproveTools: z.array(z.string()).optional(),
  logoUrl: z.string().url().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的 ID' })
  }

  const data = updateSchema.parse(body)
  const service = useMcpServerService()

  const server = await service.update(id, user.id, data)
  if (!server) {
    throw createError({ statusCode: 404, message: '服务不存在' })
  }

  return { server }
})

/**
 * POST /api/mcp-servers
 * 创建 MCP 服务
 */
import { z } from 'zod'
import { useMcpServerService } from '../../services/mcpServer'
import { inferTransportType } from '../../services/mcpClient/transports'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['sse', 'streamableHttp', 'stdio']).optional(),
  baseUrl: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeout: z.number().min(1).max(600).default(60),
  logoUrl: z.string().url().optional(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const data = createSchema.parse(body)

  // 自动推断类型
  let type = data.type
  if (!type && data.baseUrl) {
    type = inferTransportType(data.baseUrl)
  }
  if (!type) {
    throw createError({
      statusCode: 400,
      message: '请指定服务类型或提供服务地址',
    })
  }

  const service = useMcpServerService()
  const server = await service.create({
    userId: user.id,
    name: data.name,
    description: data.description || null,
    type,
    baseUrl: data.baseUrl || null,
    headers: data.headers || null,
    command: data.command || null,
    args: data.args || null,
    env: data.env || null,
    timeout: data.timeout,
    logoUrl: data.logoUrl || null,
    disabledTools: [],
    autoApproveTools: [],
  })

  return { server }
})

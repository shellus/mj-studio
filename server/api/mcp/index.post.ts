/**
 * POST /api/mcp - MCP 协议入口端点
 *
 * 处理 MCP 协议的 Streamable HTTP 请求
 */
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { requireMcpAuth } from '../../utils/jwt'
import { createMcpServer } from '../../services/mcp'

// 存储活跃的 MCP 会话
// Key: sessionId, Value: { transport, server, userId }
const sessions: Map<string, {
  transport: StreamableHTTPServerTransport
  server: McpServer
  userId: number
}> = new Map()

// 清理过期会话（30 分钟无活动）
const SESSION_TIMEOUT = 30 * 60 * 1000
setInterval(() => {
  // 这里可以添加会话超时清理逻辑
}, SESSION_TIMEOUT)

export default defineEventHandler(async (event) => {
  // 认证
  const { user } = await requireMcpAuth(event)

  const sessionId = getHeader(event, 'mcp-session-id')
  const body = await readBody(event)

  let transport: StreamableHTTPServerTransport
  let server: McpServer

  if (sessionId && sessions.has(sessionId)) {
    // 复用已有会话
    const session = sessions.get(sessionId)!

    // 验证会话所属用户
    if (session.userId !== user.id) {
      throw createError({
        statusCode: 403,
        message: '无权访问此会话',
      })
    }

    transport = session.transport
    server = session.server
  } else if (!sessionId && isInitializeRequest(body)) {
    // 创建新会话
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, userId: user.id })
        console.log(`[MCP] 会话已创建: ${id}, 用户: ${user.id}`)
      },
      onsessionclosed: (id) => {
        sessions.delete(id)
        console.log(`[MCP] 会话已关闭: ${id}`)
      },
    })

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId)
      }
    }

    // 创建 MCP 服务器
    server = createMcpServer(user)
    await server.connect(transport)
  } else {
    // 无效请求
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: sessionId ? '会话不存在或已过期' : '需要先发送初始化请求',
    })
  }

  // 获取原始 Node.js req/res 对象
  const nodeReq = event.node.req
  const nodeRes = event.node.res

  // 处理请求
  await transport.handleRequest(nodeReq as any, nodeRes as any, body)

  // 标记响应已发送，防止 H3 再次处理
  event._handled = true
})

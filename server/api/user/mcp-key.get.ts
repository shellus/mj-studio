// GET /api/user/mcp-key - 获取当前用户的 MCP API Key
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const [user] = await db.select({
    mcpApiKey: users.mcpApiKey,
  }).from(users).where(eq(users.id, sessionUser.id)).limit(1)

  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  return {
    mcpApiKey: user.mcpApiKey,
  }
})

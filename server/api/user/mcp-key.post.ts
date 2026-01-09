// POST /api/user/mcp-key - 生成或重新生成 MCP API Key
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'
import { randomBytes } from 'crypto'

/**
 * 生成 MCP API Key
 * 格式：mjs_[32位随机hex字符]
 */
function generateMcpApiKey(): string {
  const randomPart = randomBytes(16).toString('hex')
  return `mjs_${randomPart}`
}

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const newKey = generateMcpApiKey()

  await db.update(users)
    .set({ mcpApiKey: newKey })
    .where(eq(users.id, sessionUser.id))

  return {
    mcpApiKey: newKey,
  }
})

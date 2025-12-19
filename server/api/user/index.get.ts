// GET /api/user - 获取当前用户信息
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    avatar: users.avatar,
    blurByDefault: users.blurByDefault,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, sessionUser.id)).limit(1)

  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  return user
})

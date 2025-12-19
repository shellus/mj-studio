// PUT /api/user - 更新当前用户信息
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const body = await readBody(event)
  const { name, avatar, blurByDefault } = body

  // 构建更新对象
  const updateData: Record<string, any> = {}

  if (name !== undefined) {
    updateData.name = name?.trim() || null
  }

  if (avatar !== undefined) {
    // 头像可以是 base64 或 URL
    updateData.avatar = avatar || null
  }

  if (blurByDefault !== undefined) {
    updateData.blurByDefault = Boolean(blurByDefault)
  }

  // 如果没有需要更新的字段
  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, message: '没有需要更新的字段' })
  }

  await db.update(users).set(updateData).where(eq(users.id, sessionUser.id))

  // 返回更新后的用户信息
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    avatar: users.avatar,
    blurByDefault: users.blurByDefault,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, sessionUser.id)).limit(1)

  return user
})

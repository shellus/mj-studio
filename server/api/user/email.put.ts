// PUT /api/user/email - 修改当前用户邮箱
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'
import { verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const body = await readBody(event)
  const { newEmail, password } = body

  // 验证参数
  if (!newEmail || !password) {
    throw createError({ statusCode: 400, message: '请填写新邮箱和密码' })
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(newEmail)) {
    throw createError({ statusCode: 400, message: '邮箱格式不正确' })
  }

  // 检查邮箱是否已被使用
  const [existingUser] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .limit(1)

  if (existingUser && existingUser.id !== sessionUser.id) {
    throw createError({ statusCode: 400, message: '该邮箱已被其他用户使用' })
  }

  // 获取用户当前密码
  const [user] = await db.select({
    id: users.id,
    password: users.password,
  }).from(users).where(eq(users.id, sessionUser.id)).limit(1)

  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  // 验证密码
  const isValid = await verifyPassword(user.password, password)
  if (!isValid) {
    throw createError({ statusCode: 400, message: '密码错误' })
  }

  // 更新邮箱
  await db.update(users).set({ email: newEmail }).where(eq(users.id, sessionUser.id))

  return { success: true, message: '邮箱修改成功', email: newEmail }
})

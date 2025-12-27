// PUT /api/user/password - 修改当前用户密码
import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { db } from '../../database'
import { hashPassword, verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)

  const body = await readBody(event)
  const { currentPassword, newPassword } = body

  // 验证参数
  if (!currentPassword || !newPassword) {
    throw createError({ statusCode: 400, message: '请填写当前密码和新密码' })
  }

  if (newPassword.length < 6) {
    throw createError({ statusCode: 400, message: '新密码长度不能少于6位' })
  }

  // 获取用户当前密码
  const [user] = await db.select({
    id: users.id,
    password: users.password,
  }).from(users).where(eq(users.id, sessionUser.id)).limit(1)

  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  // 验证当前密码
  const isValid = await verifyPassword(user.password, currentPassword)
  if (!isValid) {
    throw createError({ statusCode: 400, message: '当前密码错误' })
  }

  // 哈希新密码并更新
  const hashedPassword = await hashPassword(newPassword)
  await db.update(users).set({ password: hashedPassword }).where(eq(users.id, sessionUser.id))

  return { success: true, message: '密码修改成功' }
})

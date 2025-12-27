// POST /api/user/delete - 删除用户账号及所有数据
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../database'
import {
  users,
  upstreams,
  aimodels,
  tasks,
  assistants,
  conversations,
  messages,
  userSettings,
} from '../../database/schema'
import { verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const { user: sessionUser } = await requireAuth(event)
  const body = await readBody(event)
  const { password } = body

  if (!password) {
    throw createError({ statusCode: 400, message: '请输入密码确认删除' })
  }

  // 验证密码
  const [user] = await db.select({ id: users.id, password: users.password })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1)

  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  const isValid = await verifyPassword(user.password, password)
  if (!isValid) {
    throw createError({ statusCode: 400, message: '密码错误' })
  }

  // 开始删除用户数据（按依赖顺序）
  const userId = sessionUser.id

  // 1. 获取用户的所有对话 ID
  const userConversations = await db.select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.userId, userId))

  const conversationIds = userConversations.map(c => c.id)

  // 2. 删除消息（通过对话 ID）
  if (conversationIds.length > 0) {
    await db.delete(messages)
      .where(inArray(messages.conversationId, conversationIds))
  }

  // 3. 删除对话
  await db.delete(conversations)
    .where(eq(conversations.userId, userId))

  // 4. 删除助手
  await db.delete(assistants)
    .where(eq(assistants.userId, userId))

  // 5. 获取用户的所有上游配置 ID
  const userUpstreams = await db.select({ id: upstreams.id })
    .from(upstreams)
    .where(eq(upstreams.userId, userId))

  const upstreamIds = userUpstreams.map(u => u.id)

  // 6. 删除 AI 模型配置（通过上游 ID）
  if (upstreamIds.length > 0) {
    await db.delete(aimodels)
      .where(inArray(aimodels.upstreamId, upstreamIds))
  }

  // 7. 删除上游配置
  await db.delete(upstreams)
    .where(eq(upstreams.userId, userId))

  // 8. 删除绘图任务
  await db.delete(tasks)
    .where(eq(tasks.userId, userId))

  // 9. 删除用户设置
  await db.delete(userSettings)
    .where(eq(userSettings.userId, userId))

  // 10. 最后删除用户
  await db.delete(users)
    .where(eq(users.id, userId))

  return { success: true, message: '账号已删除' }
})

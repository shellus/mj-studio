import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../../database'
import { workflows } from '../../database/schema'

// DELETE /api/workflows/:id - 删除工作流（软删除）
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的工作流ID' })
  }

  // 查询数据库
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(
      eq(workflows.id, id),
      eq(workflows.userId, userId),
      isNull(workflows.deletedAt),
    ))
    .limit(1)

  if (!workflow) {
    throw createError({ statusCode: 404, message: '工作流不存在' })
  }

  // 软删除
  await db
    .update(workflows)
    .set({ deletedAt: new Date() })
    .where(eq(workflows.id, id))

  return {
    success: true,
    message: '工作流已删除',
  }
})

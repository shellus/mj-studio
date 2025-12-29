import { eq, isNull, desc } from 'drizzle-orm'
import { db } from '../../database'
import { workflows } from '../../database/schema'

// GET /api/workflows - 获取工作流列表
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id

  const list = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      description: workflows.description,
      thumbnail: workflows.thumbnail,
      createdAt: workflows.createdAt,
      updatedAt: workflows.updatedAt,
    })
    .from(workflows)
    .where(eq(workflows.userId, userId))
    .where(isNull(workflows.deletedAt))
    .orderBy(desc(workflows.updatedAt))

  return {
    success: true,
    data: list.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  }
})

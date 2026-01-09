/**
 * list_tasks 工具实现
 */
import type { AuthUser, TaskType, TaskStatus } from '../../../../app/shared/types'
import { db } from '../../../database'
import { tasks } from '../../../database/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { getFullResourceUrl } from '../../../utils/url'

export async function listTasks(
  user: AuthUser,
  taskType?: TaskType,
  status?: TaskStatus,
  limit?: number,
) {
  const actualLimit = Math.min(limit || 10, 50)

  // 构建查询条件
  let whereClause = and(
    eq(tasks.userId, user.id),
    isNull(tasks.deletedAt),
  )

  if (taskType) {
    whereClause = and(whereClause, eq(tasks.taskType, taskType))
  }

  if (status) {
    whereClause = and(whereClause, eq(tasks.status, status))
  }

  // 获取总数
  const allTasks = await db.query.tasks.findMany({
    where: whereClause,
  })
  const total = allTasks.length

  // 获取分页数据
  const taskList = await db
    .select({
      id: tasks.id,
      taskType: tasks.taskType,
      status: tasks.status,
      prompt: tasks.prompt,
      resourceUrl: tasks.resourceUrl,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(whereClause)
    .orderBy(desc(tasks.createdAt))
    .limit(actualLimit)

  const result = {
    tasks: taskList.map(t => ({
      taskId: t.id,
      taskType: t.taskType,
      status: t.status,
      prompt: t.prompt,
      resourceUrl: getFullResourceUrl(t.resourceUrl),
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    })),
    total,
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

/**
 * get_task 工具实现
 */
import type { AuthUser } from '../../../../app/shared/types'
import { db } from '../../../database'
import { tasks } from '../../../database/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getFullResourceUrl } from '../../../utils/url'

export async function getTask(user: AuthUser, taskId: number) {
  const task = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.userId, user.id),
      isNull(tasks.deletedAt),
    ),
  })

  if (!task) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '任务不存在' }) }],
      isError: true,
    }
  }

  const result = {
    taskId: task.id,
    taskType: task.taskType,
    status: task.status,
    prompt: task.prompt,
    resourceUrl: getFullResourceUrl(task.resourceUrl),
    error: task.error,
    progress: task.progress,
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

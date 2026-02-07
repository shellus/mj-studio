/**
 * waitForTask - 阻塞等待任务完成的共享函数
 */
import { db } from '../../../database'
import { tasks } from '../../../database/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { useTaskService } from '../../task'
import { getFullResourceUrl } from '../../../utils/url'

export interface WaitResult {
  status: 'success' | 'failed' | 'cancelled' | 'timeout' | 'error'
  taskId: number
  resourceUrl?: string | null
  error?: string | null
}

const POLL_INTERVAL = 5000 // 5 秒

export async function waitForTask(
  taskId: number,
  userId: number,
  timeoutMs: number,
): Promise<WaitResult> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))

    const task = await db.query.tasks.findFirst({
      where: and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
      ),
    })

    if (!task) {
      return { status: 'error', taskId, error: '任务不存在' }
    }

    if (task.status === 'success') {
      return {
        status: 'success',
        taskId,
        resourceUrl: getFullResourceUrl(task.resourceUrl),
      }
    }

    if (task.status === 'failed') {
      return { status: 'failed', taskId, error: task.error }
    }

    if (task.status === 'cancelled') {
      return { status: 'cancelled', taskId }
    }

    // 异步 Provider 需要主动同步状态
    try {
      const taskService = useTaskService()
      await taskService.syncTaskStatus(taskId)
    } catch {
      // 同步失败不影响轮询
    }
  }

  return { status: 'timeout', taskId }
}

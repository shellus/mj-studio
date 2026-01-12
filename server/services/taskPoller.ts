// 异步任务状态轮询器
// 定期检查 processing 状态的异步任务（MJ、抠抠图、视频），同步上游状态并通过 SSE 推送更新

import { db } from '../database'
import { tasks, aimodels } from '../database/schema'
import type { Task, ApiFormat } from '../database/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import { useTaskService } from './task'

// 异步 API 格式列表（需要轮询的）
const ASYNC_API_FORMATS: ApiFormat[] = ['mj-proxy', 'video-unified', 'koukoutu', 'sora-ephone']

// 主定时器间隔（取最小轮询间隔）
const POLL_INTERVAL_MS = 3 * 1000 // 3秒

// 轮询间隔配置（根据预计时间）
function getPollIntervalMs(estimatedTime: number): number {
  if (estimatedTime <= 30) {
    return 3 * 1000 // 3秒
  } else if (estimatedTime <= 300) {
    return 10 * 1000 // 10秒
  } else {
    return 30 * 1000 // 30秒
  }
}

// 任务上次轮询时间（内存缓存）
const lastPollTime = new Map<number, number>()

// 清理已完成任务的缓存
function cleanupCache(taskId: number): void {
  lastPollTime.delete(taskId)
}

// 检查任务是否需要本轮轮询
async function shouldPollTask(task: Task): Promise<boolean> {
  const now = Date.now()
  const lastPoll = lastPollTime.get(task.id) || 0

  // 获取任务的预计时间
  const aimodel = await db.query.aimodels.findFirst({
    where: eq(aimodels.id, task.aimodelId),
  })
  const estimatedTime = aimodel?.estimatedTime ?? 60

  const interval = getPollIntervalMs(estimatedTime)
  return now - lastPoll >= interval
}

// 轮询单个任务
async function pollTask(taskId: number): Promise<void> {
  const taskService = useTaskService()

  try {
    const task = await taskService.syncTaskStatus(taskId)

    // 更新上次轮询时间
    lastPollTime.set(taskId, Date.now())

    // 如果任务已完成或失败，清理缓存
    if (task && (task.status === 'success' || task.status === 'failed')) {
      cleanupCache(taskId)
    }
  } catch (error) {
    console.error(`[TaskPoller] 轮询任务 #${taskId} 失败:`, error)
  }
}

// 处理遗留的 submitting 状态任务（进程重启后恢复）
async function recoverSubmittingTasks(): Promise<void> {
  const taskService = useTaskService()

  const submittingTasks = await db.select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'submitting'),
        inArray(tasks.apiFormat, ASYNC_API_FORMATS),
        isNull(tasks.deletedAt)
      )
    )

  for (const task of submittingTasks) {
    if (task.upstreamTaskId) {
      // 有上游任务ID，改为 processing 继续轮询
      await taskService.updateTask(task.id, { status: 'processing' })
      console.log(`[TaskPoller] 恢复任务 #${task.id}: submitting -> processing`)
    } else {
      // 无上游任务ID，提交未完成，标记失败
      await taskService.updateTask(task.id, {
        status: 'failed',
        error: '任务提交中断（服务重启）',
      })
      console.log(`[TaskPoller] 任务 #${task.id} 提交未完成，标记为失败`)
    }
  }
}

// 主轮询循环
async function pollProcessingTasks(): Promise<void> {
  // 查询所有需要轮询的 processing 任务
  const processingTasks = await db.select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'processing'),
        inArray(tasks.apiFormat, ASYNC_API_FORMATS),
        isNull(tasks.deletedAt)
      )
    )

  if (processingTasks.length === 0) return

  // 检查每个任务是否需要本轮轮询
  const tasksToPoll: Task[] = []
  for (const task of processingTasks) {
    if (await shouldPollTask(task)) {
      tasksToPoll.push(task)
    }
  }

  if (tasksToPoll.length === 0) return

  console.log(`[TaskPoller] 轮询 ${tasksToPoll.length} 个任务: ${tasksToPoll.map(t => `#${t.id}`).join(', ')}`)

  // 并行轮询所有任务
  await Promise.all(tasksToPoll.map(task => pollTask(task.id)))
}

// 启动轮询器
export function startTaskPoller(): void {
  console.log('[TaskPoller] 启动异步任务状态轮询器')

  // 恢复遗留任务
  recoverSubmittingTasks().catch(err => {
    console.error('[TaskPoller] 恢复遗留任务失败:', err)
  })

  // 启动主定时器
  setInterval(() => {
    pollProcessingTasks().catch(err => {
      console.error('[TaskPoller] 轮询循环错误:', err)
    })
  }, POLL_INTERVAL_MS)

  console.log(`[TaskPoller] 定时器已启动，间隔 ${POLL_INTERVAL_MS / 1000}秒`)
}

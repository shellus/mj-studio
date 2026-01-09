// 任务状态管理
import type { ModelType, ApiFormat, TaskType, ModelParams, TaskUpstreamSummary, PaginatedResponse } from '../shared/types'
import type { MJButton } from '../shared/events'
import {
  useGlobalEvents,
  type TaskCreated,
  type TaskStatusUpdated,
  type TaskDeleted,
  type TaskRestored,
  type TaskBlurUpdated,
  type TasksBlurUpdated,
} from './useGlobalEvents'

export type { TaskUpstreamSummary }

// 单例模式：防止事件处理器重复注册
let isTaskEventRegistered = false

// 前端 Task 类型（API 响应格式，与数据库 Task 不同）
export interface Task {
  id: number
  userId: number
  upstreamId: number
  aimodelId: number
  taskType: TaskType  // 任务类型：image | video
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  upstream?: TaskUpstreamSummary // 精简的上游配置
  prompt: string | null
  modelParams: ModelParams | null  // 模型专用参数
  images: string[]
  type: string
  status: 'pending' | 'submitting' | 'processing' | 'success' | 'failed' | 'cancelled'
  upstreamTaskId: string | null
  progress: string | null
  resourceUrl: string | null
  error: string | null
  isBlurred: boolean
  buttons: MJButton[] | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  duration?: number  // 实际耗时（秒），仅在任务完成时有值
}

export function useTasks() {
  const tasks = useState<Task[]>('tasks', () => [])
  const isLoading = useState('tasks-loading', () => false)

  // 分页状态
  const currentPage = useState('tasks-page', () => 1)
  const pageSize = useState('tasks-pageSize', () => 20)
  const total = useState('tasks-total', () => 0)

  // 筛选状态
  const sourceType = useState<'workbench' | 'chat' | 'all'>('tasks-sourceType', () => 'workbench')
  const taskType = useState<TaskType | 'all'>('tasks-taskType', () => 'all')
  const keyword = useState('tasks-keyword', () => '')

  // 全局事件
  const { on } = useGlobalEvents()

  // 加载任务列表（支持分页和筛选）
  async function loadTasks(page?: number) {
    isLoading.value = true
    if (page !== undefined) {
      currentPage.value = page
    }

    try {
      const result = await $fetch<PaginatedResponse<Task>>('/api/tasks', {
        query: {
          page: currentPage.value,
          pageSize: pageSize.value,
          sourceType: sourceType.value,
          taskType: taskType.value !== 'all' ? taskType.value : undefined,
          keyword: keyword.value || undefined,
        },
      })
      tasks.value = result.tasks
      total.value = result.total
      // 任务状态更新完全通过 SSE 事件 task.status.updated 处理
    } catch (error) {
      console.error('加载任务列表失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 执行按钮动作
  // 新任务添加通过全局 SSE 事件 task.created 处理
  async function executeAction(task: Task, customId: string) {
    try {
      await $fetch<{ success: boolean; taskId: number }>('/api/tasks/action', {
        method: 'POST',
        body: { taskId: task.id, customId },
      })
      // 不再本地操作，由 SSE 事件 handleTaskCreated 处理
    } catch (error: any) {
      console.error('执行动作失败:', error)
      throw error
    }
  }

  // 删除任务（调用后端API软删除）
  // 任务删除通过全局 SSE 事件 task.deleted 处理
  async function deleteTask(taskId: number) {
    await $fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    // 不再本地操作，由 SSE 事件 handleTaskDeleted 处理
  }

  // 批量更新模糊状态（操作所有任务，不仅是当前页）
  // 模糊状态更新通过全局 SSE 事件 tasks.blur.updated 处理
  async function batchBlur(isBlurred: boolean, taskIds?: number[]) {
    await $fetch('/api/tasks/blur-batch', {
      method: 'PATCH',
      body: { isBlurred, taskIds },
    })
    // 不再本地操作，由 SSE 事件 handleTasksBlurUpdated 处理
  }

  // 重试失败的任务
  // 任务状态更新通过全局 SSE 事件 task.status.updated 处理
  async function retryTask(taskId: number) {
    try {
      await $fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' })
      // 不再本地操作，由 SSE 事件 handleTaskStatusUpdated 处理
    } catch (error: any) {
      console.error('重试任务失败:', error)
      throw error
    }
  }

  // 取消进行中的任务
  // 任务状态更新通过全局 SSE 事件 task.status.updated 处理
  async function cancelTask(taskId: number) {
    try {
      await $fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
      // 不再本地操作，由 SSE 事件 handleTaskStatusUpdated 处理
    } catch (error: any) {
      console.error('取消任务失败:', error)
      throw error
    }
  }

  // ==================== 事件处理器 ====================

  // 处理任务创建事件（从其他标签页/设备创建的任务）
  function handleTaskCreated(data: TaskCreated) {
    const { task } = data

    // 检查是否已存在
    const exists = tasks.value.some(t => t.id === task.id)
    if (exists) return

    // 如果当前在第一页且来源类型匹配，添加到列表
    if (currentPage.value === 1) {
      // 需要获取完整的任务信息（事件中只有基础信息）
      $fetch<Task>(`/api/tasks/${task.id}`).then(fullTask => {
        // 再次检查是否已存在（防止并发）
        const existsNow = tasks.value.some(t => t.id === task.id)
        if (!existsNow) {
          tasks.value.unshift(fullTask)
          total.value += 1
          // 任务状态更新完全通过 SSE 事件处理
        }
      }).catch(err => {
        console.error('[useTasks] 获取新任务详情失败:', err)
      })
    }
  }

  // 处理任务状态更新事件
  function handleTaskStatusUpdated(data: TaskStatusUpdated) {
    const { taskId, status, progress, resourceUrl, error, buttons, duration } = data

    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index < 0) return

    const existing = tasks.value[index]!

    // 更新任务状态
    tasks.value[index] = {
      ...existing,
      status: status as Task['status'],
      progress: progress !== undefined ? `${progress}%` : existing.progress,
      resourceUrl: resourceUrl !== undefined ? resourceUrl : existing.resourceUrl,
      error: error !== undefined ? error : existing.error,
      buttons: buttons !== undefined ? buttons : existing.buttons,
      duration: duration !== undefined ? duration : existing.duration,
    }
  }

  // 处理任务删除事件
  function handleTaskDeleted(data: TaskDeleted) {
    const { taskId } = data

    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index >= 0) {
      tasks.value.splice(index, 1)
      total.value = Math.max(0, total.value - 1)
    }
  }

  // 处理任务恢复事件
  function handleTaskRestored(data: TaskRestored) {
    const { taskId } = data

    // 从回收站恢复，需要重新加载列表
    // 简单处理：如果在第一页，重新加载
    if (currentPage.value === 1) {
      loadTasks(1)
    }
  }

  // 处理模糊状态更新事件
  function handleTaskBlurUpdated(data: TaskBlurUpdated) {
    const { taskId, isBlurred } = data

    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index >= 0) {
      const existing = tasks.value[index]!
      tasks.value[index] = { ...existing, isBlurred }
    }
  }

  // 处理批量模糊状态更新事件
  function handleTasksBlurUpdated(data: TasksBlurUpdated) {
    const { taskIds, isBlurred } = data

    if (taskIds.length === 0) {
      // 空数组表示所有任务
      tasks.value = tasks.value.map(t => ({ ...t, isBlurred }))
    } else {
      tasks.value = tasks.value.map(t =>
        taskIds.includes(t.id) ? { ...t, isBlurred } : t
      )
    }
  }

  // 注册事件处理器（单例模式，防止重复注册）
  if (import.meta.client && !isTaskEventRegistered) {
    isTaskEventRegistered = true
    on<TaskCreated>('task.created', handleTaskCreated)
    on<TaskStatusUpdated>('task.status.updated', handleTaskStatusUpdated)
    on<TaskDeleted>('task.deleted', handleTaskDeleted)
    on<TaskRestored>('task.restored', handleTaskRestored)
    on<TaskBlurUpdated>('task.blur.updated', handleTaskBlurUpdated)
    on<TasksBlurUpdated>('tasks.blur.updated', handleTasksBlurUpdated)
  }

  return {
    tasks,
    isLoading,
    currentPage,
    pageSize,
    total,
    sourceType,
    taskType,
    keyword,
    loadTasks,
    executeAction,
    deleteTask,
    batchBlur,
    retryTask,
    cancelTask,
  }
}

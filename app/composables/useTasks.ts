// 任务状态管理
import type { ModelType, ApiFormat, TaskType, ModelParams, TaskUpstreamSummary, PaginatedResponse } from '../shared/types'
import type { MJButton } from '../shared/events'

export type { TaskUpstreamSummary }

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

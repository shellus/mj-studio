// 任务状态管理
import type { ModelType, ApiFormat, TaskType, ModelParams } from '../shared/types'

// 精简的上游配置（用于任务列表/详情）
export interface TaskUpstreamSummary {
  name: string
  estimatedTime: number | null
}

// 后端Task类型
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
  buttons: Array<{
    customId: string
    emoji: string
    label: string
    style: number
    type: number
  }> | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// 分页响应类型
interface PaginatedResponse<T> {
  tasks: T[]
  total: number
  page: number
  pageSize: number
}

export function useTasks() {
  const tasks = useState<Task[]>('tasks', () => [])
  const pollingIntervals = new Map<number, ReturnType<typeof setInterval>>()
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

      // 为处理中的任务启动轮询
      for (const task of result.tasks) {
        if (['pending', 'submitting', 'processing'].includes(task.status)) {
          startPolling(task.id)
        }
      }
    } catch (error) {
      console.error('加载任务列表失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 添加任务（前端调用API后，后端已保存，只需轮询）
  async function addTask(taskId: number) {
    // 立即获取任务状态
    try {
      const task = await $fetch<Task>(`/api/tasks/${taskId}`)
      // 添加到列表头部
      const existingIndex = tasks.value.findIndex((t) => t.id === taskId)
      if (existingIndex >= 0) {
        tasks.value[existingIndex] = task
      } else {
        tasks.value.unshift(task)
      }
      // 开始轮询
      startPolling(taskId)
      return task
    } catch (error) {
      console.error('获取任务失败:', error)
      throw error
    }
  }

  // 开始轮询任务状态（使用 setTimeout 递归，避免请求堆积）
  function startPolling(taskId: number) {
    if (pollingIntervals.has(taskId)) return

    const poll = async () => {
      try {
        const result = await $fetch<Task>(`/api/tasks/${taskId}`)
        const index = tasks.value.findIndex((t) => t.id === taskId)

        if (index < 0) {
          stopPolling(taskId)
          return
        }

        // 更新任务
        tasks.value[index] = result

        // 终态停止轮询
        if (['success', 'failed'].includes(result.status)) {
          stopPolling(taskId)
          return
        }
      } catch (error) {
        console.error('轮询任务失败:', error)
      }

      // 请求完成后，等待 3 秒再发起下一次
      const timeout = setTimeout(poll, 3000)
      pollingIntervals.set(taskId, timeout)
    }

    // 立即执行第一次
    poll()
  }

  // 停止轮询
  function stopPolling(taskId: number) {
    const timeout = pollingIntervals.get(taskId)
    if (timeout) {
      clearTimeout(timeout)
      pollingIntervals.delete(taskId)
    }
  }

  // 执行按钮动作
  async function executeAction(task: Task, customId: string) {
    try {
      const result = await $fetch<{ success: boolean; taskId: number }>('/api/tasks/action', {
        method: 'POST',
        body: { taskId: task.id, customId },
      })

      if (result.success && result.taskId) {
        // 添加新任务
        await addTask(result.taskId)
      }
    } catch (error: any) {
      console.error('执行动作失败:', error)
      throw error
    }
  }

  // 删除任务（调用后端API软删除）
  async function deleteTask(taskId: number) {
    stopPolling(taskId)
    await $fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    tasks.value = tasks.value.filter((t) => t.id !== taskId)
    // 更新总数
    total.value = Math.max(0, total.value - 1)
  }

  // 批量更新模糊状态（操作所有任务，不仅是当前页）
  async function batchBlur(isBlurred: boolean, taskIds?: number[]) {
    await $fetch('/api/tasks/blur-batch', {
      method: 'PATCH',
      body: { isBlurred, taskIds },
    })
    // 更新本地当前页的状态
    if (taskIds) {
      tasks.value = tasks.value.map((t) =>
        taskIds.includes(t.id) ? { ...t, isBlurred } : t
      )
    } else {
      // 批量操作所有任务时，更新当前页显示的任务
      tasks.value = tasks.value.map((t) => ({ ...t, isBlurred }))
    }
  }

  // 重试失败的任务
  async function retryTask(taskId: number) {
    try {
      await $fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' })

      // 更新本地状态为pending
      const index = tasks.value.findIndex((t) => t.id === taskId)
      if (index >= 0) {
        tasks.value[index] = {
          ...tasks.value[index],
          status: 'pending',
          error: null,
        }
      }

      // 开始轮询
      startPolling(taskId)
    } catch (error: any) {
      console.error('重试任务失败:', error)
      throw error
    }
  }

  // 取消进行中的任务
  async function cancelTask(taskId: number) {
    try {
      await $fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })

      // 停止轮询
      stopPolling(taskId)

      // 更新本地状态为cancelled
      const index = tasks.value.findIndex((t) => t.id === taskId)
      if (index >= 0) {
        tasks.value[index] = {
          ...tasks.value[index],
          status: 'cancelled',
          error: '用户取消',
        }
      }
    } catch (error: any) {
      console.error('取消任务失败:', error)
      throw error
    }
  }

  // 清理所有轮询（组件卸载时调用）
  function cleanup() {
    pollingIntervals.forEach((_, taskId) => stopPolling(taskId))
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
    addTask,
    executeAction,
    deleteTask,
    batchBlur,
    retryTask,
    cancelTask,
    cleanup,
    startPolling,
  }
}

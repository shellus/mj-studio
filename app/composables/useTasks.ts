// 任务状态管理

type ModelType = 'midjourney' | 'gemini' | 'flux' | 'dalle' | 'doubao' | 'gpt4o-image' | 'grok-image'
type ApiFormat = 'mj-proxy' | 'gemini' | 'dalle' | 'openai-chat'

// 模型类型配置
export interface ModelTypeConfig {
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  estimatedTime: number
}

// 模型配置类型
export interface ModelConfig {
  id: number
  userId: number
  name: string
  baseUrl: string
  apiKey: string
  modelTypeConfigs: ModelTypeConfig[]
  remark: string | null
  isDefault: boolean
  createdAt: string
}

// 后端Task类型
export interface Task {
  id: number
  userId: number
  modelConfigId: number
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string | null
  modelConfig?: ModelConfig // 关联的模型配置
  prompt: string | null
  images: string[]
  type: string
  status: 'pending' | 'submitting' | 'processing' | 'success' | 'failed'
  upstreamTaskId: string | null
  progress: string | null
  imageUrl: string | null
  error: string | null
  buttons: Array<{
    customId: string
    emoji: string
    label: string
    style: number
    type: number
  }> | null
  createdAt: string
  updatedAt: string
}

export function useTasks() {
  const tasks = useState<Task[]>('tasks', () => [])
  const pollingIntervals = new Map<number, ReturnType<typeof setInterval>>()
  const isLoading = useState('tasks-loading', () => false)

  // 加载任务列表
  async function loadTasks() {
    isLoading.value = true
    try {
      const result = await $fetch<Task[]>('/api/tasks')
      tasks.value = result

      // 为处理中的任务启动轮询
      for (const task of result) {
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

  // 开始轮询任务状态
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
        }
      } catch (error) {
        console.error('轮询任务失败:', error)
      }
    }

    // 立即执行一次
    poll()
    // 每 3 秒轮询一次
    const interval = setInterval(poll, 3000)
    pollingIntervals.set(taskId, interval)
  }

  // 停止轮询
  function stopPolling(taskId: number) {
    const interval = pollingIntervals.get(taskId)
    if (interval) {
      clearInterval(interval)
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

  // 删除任务（仅从前端列表移除）
  function removeTask(taskId: number) {
    stopPolling(taskId)
    tasks.value = tasks.value.filter((t) => t.id !== taskId)
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

  // 清理所有轮询（组件卸载时调用）
  function cleanup() {
    pollingIntervals.forEach((_, taskId) => stopPolling(taskId))
  }

  return {
    tasks,
    isLoading,
    loadTasks,
    addTask,
    executeAction,
    removeTask,
    retryTask,
    cleanup,
    startPolling,
  }
}

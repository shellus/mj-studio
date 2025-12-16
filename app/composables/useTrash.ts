// 回收站状态管理
import type { Task } from './useTasks'

// 分页响应类型
interface PaginatedResponse {
  tasks: Task[]
  total: number
  page: number
  pageSize: number
}

export function useTrash() {
  const tasks = useState<Task[]>('trash-tasks', () => [])
  const isLoading = useState('trash-loading', () => false)

  // 分页状态
  const currentPage = useState('trash-page', () => 1)
  const pageSize = useState('trash-pageSize', () => 20)
  const total = useState('trash-total', () => 0)

  // 加载回收站列表（支持分页）
  async function loadTrash(page?: number) {
    isLoading.value = true
    if (page !== undefined) {
      currentPage.value = page
    }

    try {
      const result = await $fetch<PaginatedResponse>('/api/tasks/trash', {
        query: {
          page: currentPage.value,
          pageSize: pageSize.value,
        },
      })
      tasks.value = result.tasks
      total.value = result.total
    } catch (error) {
      console.error('加载回收站失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 恢复任务
  async function restoreTask(taskId: number) {
    await $fetch(`/api/tasks/${taskId}/restore`, { method: 'POST' })
    tasks.value = tasks.value.filter((t) => t.id !== taskId)
    total.value = Math.max(0, total.value - 1)
  }

  // 清空回收站
  async function emptyTrash() {
    const result = await $fetch<{ success: boolean; deleted: number }>('/api/tasks/trash/empty', {
      method: 'DELETE',
    })
    tasks.value = []
    total.value = 0
    return result.deleted
  }

  return {
    tasks,
    isLoading,
    currentPage,
    pageSize,
    total,
    loadTrash,
    restoreTask,
    emptyTrash,
  }
}

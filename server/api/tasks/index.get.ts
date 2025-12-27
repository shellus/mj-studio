// GET /api/tasks - 获取用户任务列表（支持分页和筛选）
import { useTaskService } from '../../services/task'
import type { TaskType } from '../../database/schema'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const query = getQuery(event)
  const page = parseInt(query.page as string, 10) || 1
  const pageSize = parseInt(query.pageSize as string, 10) || 20
  const sourceType = query.sourceType as 'workbench' | 'chat' | 'all' | undefined
  const taskType = query.taskType as TaskType | 'all' | undefined
  const keyword = query.keyword as string | undefined

  const taskService = useTaskService()

  // 获取当前用户的任务（分页 + 筛选）
  const result = await taskService.listTasks(user.id, {
    page,
    pageSize,
    sourceType: sourceType || 'workbench',
    taskType: taskType || 'all',
    keyword: keyword?.trim() || undefined,
  })

  return result
})

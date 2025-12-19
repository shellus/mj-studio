// GET /api/tasks - 获取用户任务列表（支持分页）
import { useTaskService } from '../../services/task'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const query = getQuery(event)
  const page = parseInt(query.page as string, 10) || 1
  const pageSize = parseInt(query.pageSize as string, 10) || 20

  const taskService = useTaskService()

  // 获取当前用户的任务（分页）
  const result = await taskService.listTasks(user.id, { page, pageSize })

  return result
})

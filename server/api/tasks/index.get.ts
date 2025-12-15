// GET /api/tasks - 获取用户任务列表
import { useTaskService } from '../../services/task'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireUserSession(event)

  const query = getQuery(event)
  const limit = parseInt(query.limit as string, 10) || 50

  const taskService = useTaskService()

  // 获取当前用户的任务
  const tasks = await taskService.listTasks(user.id, limit)

  return tasks
})

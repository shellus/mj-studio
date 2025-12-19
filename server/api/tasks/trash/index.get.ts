// GET /api/tasks/trash - 获取回收站任务列表（支持分页）
import { useTaskService } from '../../../services/task'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const query = getQuery(event)
  const page = parseInt(query.page as string, 10) || 1
  const pageSize = parseInt(query.pageSize as string, 10) || 20

  const taskService = useTaskService()

  const result = await taskService.listTrashTasks(user.id, { page, pageSize })

  return result
})

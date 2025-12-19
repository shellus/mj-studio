// DELETE /api/tasks/trash/empty - 清空回收站
import { useTaskService } from '../../../services/task'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const taskService = useTaskService()
  const count = await taskService.emptyTrash(user.id)

  return { success: true, deleted: count }
})

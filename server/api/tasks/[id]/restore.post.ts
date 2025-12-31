// POST /api/tasks/:id/restore - 恢复任务
import { useTaskService } from '../../../services/task'
import { emitToUser, type TaskRestored } from '../../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: '无效的任务ID',
    })
  }

  const taskService = useTaskService()
  const success = await taskService.restoreTask(id, user.id)

  if (!success) {
    throw createError({
      statusCode: 404,
      message: '任务不存在或不在回收站中',
    })
  }

  // 广播任务恢复事件
  await emitToUser<TaskRestored>(user.id, 'task.restored', { taskId: id })

  return { success: true }
})

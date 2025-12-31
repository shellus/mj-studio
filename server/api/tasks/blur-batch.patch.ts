// PATCH /api/tasks/blur-batch - 批量更新模糊状态
import { useTaskService } from '../../services/task'
import { emitToUser, type TasksBlurUpdated } from '../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { isBlurred, taskIds } = body

  if (typeof isBlurred !== 'boolean') {
    throw createError({
      statusCode: 400,
      message: '缺少 isBlurred 参数',
    })
  }

  // taskIds 可选，不传则操作所有任务
  if (taskIds !== undefined && !Array.isArray(taskIds)) {
    throw createError({
      statusCode: 400,
      message: 'taskIds 必须是数组',
    })
  }

  const taskService = useTaskService()
  await taskService.batchBlur(user.id, isBlurred, taskIds)

  // 广播批量模糊状态更新事件
  await emitToUser<TasksBlurUpdated>(user.id, 'tasks.blur.updated', {
    taskIds: taskIds ?? [],  // 空数组表示所有任务
    isBlurred,
  })

  return { success: true }
})

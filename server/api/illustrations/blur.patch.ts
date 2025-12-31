// PATCH /api/illustrations/blur - 切换插图模糊状态
import { useTaskService } from '../../services/task'
import { emitToUser, type TaskBlurUpdated } from '../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { uniqueId, isBlurred } = body

  if (!uniqueId?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'uniqueId 是必填参数',
    })
  }

  if (typeof isBlurred !== 'boolean') {
    throw createError({
      statusCode: 400,
      message: 'isBlurred 必须是布尔值',
    })
  }

  const taskService = useTaskService()

  // 查找任务
  const task = await taskService.findByUniqueId(uniqueId.trim(), user.id)
  if (!task) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  // 更新模糊状态
  await taskService.updateTask(task.id, { isBlurred })

  // 广播模糊状态更新事件
  await emitToUser<TaskBlurUpdated>(user.id, 'task.blur.updated', {
    taskId: task.id,
    isBlurred,
  })

  return {
    success: true,
    isBlurred,
  }
})

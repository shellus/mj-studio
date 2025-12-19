// 取消任务 - 将进行中的任务标记为已取消
import { useTaskService } from '../../../services/task'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: '无效的任务ID',
    })
  }

  const taskService = useTaskService()

  // 获取任务
  const task = await taskService.getTask(id)
  if (!task) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  // 验证任务所属用户
  if (task.userId !== session.user.id) {
    throw createError({
      statusCode: 403,
      message: '无权操作此任务',
    })
  }

  // 只允许取消进行中的任务
  if (!['pending', 'submitting', 'processing'].includes(task.status)) {
    throw createError({
      statusCode: 400,
      message: '只能取消进行中的任务',
    })
  }

  // 尝试中止正在进行的 HTTP 请求
  const aborted = taskService.abortTask(id)

  // 更新任务状态为已取消
  await taskService.updateTask(id, {
    status: 'cancelled',
    error: '用户取消',
  })

  return {
    success: true,
    message: aborted ? '任务已取消，请求已中止' : '任务已取消',
  }
})

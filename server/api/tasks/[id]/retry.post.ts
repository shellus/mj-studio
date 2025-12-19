// 重试任务 - 重新提交到上游
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

  // 只允许重试失败或已取消的任务
  if (task.status !== 'failed' && task.status !== 'cancelled') {
    throw createError({
      statusCode: 400,
      message: '只能重试失败或已取消的任务',
    })
  }

  // 重置任务状态并重新提交（重置创建时间以正确计算耗时）
  await taskService.updateTask(id, {
    status: 'pending',
    error: null,
    upstreamTaskId: null,
    progress: null,
    createdAt: new Date(),
  })

  // 异步提交任务
  taskService.submitTask(id).catch((err) => {
    console.error('重试任务失败:', err)
  })

  return {
    success: true,
    message: '任务已重新提交',
  }
})

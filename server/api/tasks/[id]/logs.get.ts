// GET /api/tasks/[id]/logs - 获取任务的请求/响应日志
import { useTaskService } from '../../../services/task'
import { readTaskLogs } from '../../../services/logger'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '任务ID不能为空',
    })
  }

  const taskId = parseInt(id, 10)
  if (isNaN(taskId)) {
    throw createError({
      statusCode: 400,
      message: '无效的任务ID',
    })
  }

  const taskService = useTaskService()
  const task = await taskService.getTask(taskId)

  if (!task) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  // 验证任务属于当前用户
  if (task.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: '无权访问此任务',
    })
  }

  // 读取日志
  const logs = readTaskLogs(taskId, task.createdAt)

  if (!logs) {
    throw createError({
      statusCode: 404,
      message: '日志不存在',
    })
  }

  return logs
})

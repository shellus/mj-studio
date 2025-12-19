// GET /api/tasks/[id]/logs - 获取任务的请求/响应日志
import { useTaskService } from '../../../services/task'
import { readTaskLogs } from '../../../services/logger'
import { decodeTaskId } from '../../../utils/sqids'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '任务ID不能为空',
    })
  }

  // 支持数字ID或sqid
  let taskId = parseInt(id, 10)
  if (isNaN(taskId)) {
    const decoded = decodeTaskId(id)
    if (decoded === null) {
      throw createError({
        statusCode: 400,
        message: '无效的任务ID',
      })
    }
    taskId = decoded
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

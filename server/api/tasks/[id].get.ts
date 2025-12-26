// GET /api/tasks/[id] - 查询任务状态
import { useTaskService } from '../../services/task'

export default defineEventHandler(async (event) => {
  // 需要登录
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

  // 获取任务（包含精简的上游配置）
  let result = await taskService.getTaskWithSummary(taskId)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  let { task, upstream } = result

  // 验证任务属于当前用户
  if (task.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: '无权访问此任务',
    })
  }

  // 如果任务正在处理中，同步状态
  if (task.status === 'processing') {
    task = await taskService.syncTaskStatus(taskId) ?? task
  }

  return {
    ...task,
    upstream,
  }
})

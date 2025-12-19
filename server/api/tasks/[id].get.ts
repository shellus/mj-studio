// GET /api/tasks/[id] - 查询任务状态（支持数字ID或sqid）
import { useTaskService } from '../../services/task'
import { decodeTaskId } from '../../utils/sqids'

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

  // 支持数字ID或sqid
  let taskId = parseInt(id, 10)
  if (isNaN(taskId)) {
    // 尝试解码sqid
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

  // 获取任务（包含模型配置）
  let result = await taskService.getTaskWithConfig(taskId)

  if (!result) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  let { task, config } = result

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
    modelConfig: config,
  }
})

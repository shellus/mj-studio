// POST /api/tasks/action - 执行按钮动作
import { useTaskService } from '../../services/task'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { taskId, customId } = body

  if (!taskId || !customId) {
    throw createError({
      statusCode: 400,
      message: '缺少必要参数',
    })
  }

  const taskService = useTaskService()

  // 验证任务属于当前用户
  const task = await taskService.getTask(taskId)
  if (!task) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }
  if (task.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: '无权操作此任务',
    })
  }

  try {
    const newTask = await taskService.executeAction(taskId, customId, user.id)

    return {
      success: true,
      taskId: newTask.id,
      message: '动作已执行',
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || '执行动作失败',
    })
  }
})

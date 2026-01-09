// 更新任务的模糊状态
import { useTaskService } from '../../../services/task'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: '无效的任务ID',
    })
  }

  const body = await readBody(event)
  const { isBlurred } = body

  if (typeof isBlurred !== 'boolean') {
    throw createError({
      statusCode: 400,
      message: '缺少 isBlurred 参数',
    })
  }

  const taskService = useTaskService()
  const success = await taskService.updateBlur(id, user.id, isBlurred)

  if (!success) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  return { success: true, isBlurred }
})

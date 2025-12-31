// 更新任务的模糊状态
import { db } from '../../../database'
import { tasks } from '../../../database/schema'
import { eq, and } from 'drizzle-orm'
import { emitToUser, type TaskBlurUpdated } from '../../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
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

  // 更新任务（确保是当前用户的任务）
  const [updated] = await db.update(tasks)
    .set({ isBlurred, updatedAt: new Date() })
    .where(and(
      eq(tasks.id, id),
      eq(tasks.userId, session.user.id)
    ))
    .returning()

  if (!updated) {
    throw createError({
      statusCode: 404,
      message: '任务不存在',
    })
  }

  // 广播模糊状态更新事件
  await emitToUser<TaskBlurUpdated>(session.user.id, 'task.blur.updated', {
    taskId: id,
    isBlurred: updated.isBlurred,
  })

  return { success: true, isBlurred: updated.isBlurred }
})

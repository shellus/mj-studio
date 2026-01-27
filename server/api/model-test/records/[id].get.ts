/**
 * GET /api/model-test/records/[id] - 获取测试记录详情
 */
import { useModelTestService } from '../../../services/modelTest'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: '无效的记录 ID',
    })
  }

  const service = useModelTestService()
  const record = await service.getRecordWithResults(id, user.id)

  if (!record) {
    throw createError({
      statusCode: 404,
      message: '记录不存在',
    })
  }

  return record
})

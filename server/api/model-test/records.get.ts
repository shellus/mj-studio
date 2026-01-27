/**
 * GET /api/model-test/records - 获取测试记录列表
 */
import { useModelTestService } from '../../services/modelTest'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const limit = Number(query.limit) || 10
  const offset = Number(query.offset) || 0

  const service = useModelTestService()
  return service.listRecords(user.id, limit, offset)
})

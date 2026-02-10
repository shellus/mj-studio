// GET /api/conversations - 获取对话列表
import { useConversationService } from '../../services/conversation'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const query = getQuery(event)
  const assistantId = parseInt(query.assistantId as string, 10)
  const type = query.type as 'permanent' | 'temporary' | 'all' | undefined

  if (!assistantId || isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '请指定助手ID' })
  }

  // 验证 type 参数
  if (type && !['permanent', 'temporary', 'all'].includes(type)) {
    throw createError({ statusCode: 400, message: 'type 参数必须是 permanent、temporary 或 all' })
  }

  const service = useConversationService()
  return service.listByAssistant(user.id, assistantId, type)
})

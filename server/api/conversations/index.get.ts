// GET /api/conversations - 获取对话列表
import { useConversationService } from '../../services/conversation'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const query = getQuery(event)
  const assistantId = parseInt(query.assistantId as string, 10)

  if (!assistantId || isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '请指定助手ID' })
  }

  const service = useConversationService()
  return service.listByAssistant(user.id, assistantId)
})

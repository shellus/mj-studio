// GET /api/assistants - 获取助手列表
import { useAssistantService } from '../../services/assistant'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const service = useAssistantService()

  // 确保有默认助手
  await service.ensureDefault(user.id)

  return service.listByUser(user.id)
})

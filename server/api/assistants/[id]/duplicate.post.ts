// POST /api/assistants/[id]/duplicate - 复制助手
import { useAssistantService } from '../../../services/assistant'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '助手ID不能为空' })
  }

  const assistantId = parseInt(id, 10)
  if (isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '无效的助手ID' })
  }

  const service = useAssistantService()
  const original = await service.getById(assistantId)

  if (!original) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  if (original.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权复制此助手' })
  }

  // 创建副本，名称加上"副本"后缀
  const newAssistant = await service.create({
    userId: user.id,
    name: `${original.name} 副本`,
    description: original.description ?? undefined,
    avatar: original.avatar ?? undefined,
    systemPrompt: original.systemPrompt ?? undefined,
    aimodelId: original.aimodelId ?? undefined,
    isDefault: false, // 副本不继承默认状态
  })

  return {
    success: true,
    assistant: newAssistant,
  }
})

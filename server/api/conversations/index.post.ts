// POST /api/conversations - 创建对话
import { useConversationService } from '../../services/conversation'
import { useAssistantService } from '../../services/assistant'
import { emitToUser } from '../../services/globalEvents'
import type { ChatConversationCreated, ChatAssistantUpdated } from '../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  const { assistantId, title } = body

  if (!assistantId) {
    throw createError({ statusCode: 400, message: '请指定助手' })
  }

  // 验证助手属于当前用户
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(assistantId)
  if (!assistant || assistant.userId !== user.id) {
    throw createError({ statusCode: 400, message: '无效的助手' })
  }

  const service = useConversationService()
  const conversation = await service.create({
    userId: user.id,
    assistantId,
    title: title?.trim() || '新对话',
  })

  // 更新助手的对话数量并广播助手更新事件
  const updatedAssistant = await assistantService.refreshConversationCount(assistantId)
  if (updatedAssistant) {
    await emitToUser<ChatAssistantUpdated>(user.id, 'chat.assistant.updated', {
      assistant: {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        description: updatedAssistant.description,
        avatar: updatedAssistant.avatar,
        systemPrompt: updatedAssistant.systemPrompt,
        aimodelId: updatedAssistant.aimodelId,
        isDefault: updatedAssistant.isDefault,
        suggestions: updatedAssistant.suggestions,
        conversationCount: updatedAssistant.conversationCount,
      },
    })
  }

  // 广播对话创建事件
  await emitToUser<ChatConversationCreated>(user.id, 'chat.conversation.created', {
    conversation: {
      id: conversation.id,
      userId: conversation.userId,
      assistantId: conversation.assistantId,
      title: conversation.title,
      createdAt: conversation.createdAt instanceof Date ? conversation.createdAt.toISOString() : conversation.createdAt,
      updatedAt: conversation.updatedAt instanceof Date ? conversation.updatedAt.toISOString() : conversation.updatedAt,
    },
  })

  return conversation
})

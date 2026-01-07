// POST /api/messages/[id]/replay - 重放消息（让 AI 重新回复）
// 适配新的流式系统：创建 AI 消息后异步生成，返回消息 ID
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useAimodelService } from '../../../services/aimodel'
import { startStreamingTask } from '../../../services/streamingTask'
import { emitToUser } from '../../../services/globalEvents'
import type { ChatMessageCreated, ChatMessageDeleted } from '../../../services/globalEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '消息ID不能为空' })
  }

  const messageId = parseInt(id, 10)
  if (isNaN(messageId)) {
    throw createError({ statusCode: 400, message: '无效的消息ID' })
  }

  const conversationService = useConversationService()

  // 获取消息
  const message = await conversationService.getMessageById(messageId)
  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  // 获取对话
  const result = await conversationService.getWithMessages(message.conversationId)
  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 获取助手和模型信息
  const assistantService = useAssistantService()
  const aimodelService = useAimodelService()

  const assistant = await assistantService.getById(result.conversation.assistantId)
  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  let modelDisplayName: string | null = null
  if (assistant.aimodelId) {
    const aimodelWithUpstream = await aimodelService.getByIdWithUpstream(assistant.aimodelId)
    if (aimodelWithUpstream) {
      modelDisplayName = `${aimodelWithUpstream.upstreamName} / ${aimodelWithUpstream.name}`
    }
  }

  // 确定要重放的用户消息
  let userMessageContent: string
  let replayUserMessageId: number  // 记录用户消息 ID

  if (message.role === 'user') {
    // 重放用户消息：基于这条用户消息重新生成 AI 回复
    userMessageContent = message.content
    replayUserMessageId = message.id
  } else {
    // 重放 AI 消息：删除这条 AI 消息，找到对应的用户消息重新生成
    const msgIndex = result.messages.findIndex(m => m.id === messageId)
    const previousMessages = result.messages.slice(0, msgIndex)
    const lastUserMsg = [...previousMessages].reverse().find(m => m.role === 'user')

    if (!lastUserMsg) {
      throw createError({ statusCode: 400, message: '找不到对应的用户消息' })
    }

    userMessageContent = lastUserMsg.content
    replayUserMessageId = lastUserMsg.id

    // 删除这条 AI 消息
    await conversationService.removeMessage(messageId, user.id)

    // 广播消息删除事件
    await emitToUser<ChatMessageDeleted>(user.id, 'chat.message.deleted', {
      conversationId: message.conversationId,
      messageId,
    })
  }

  // 创建 AI 消息（status: created，content 为空）
  const assistantMessage = await conversationService.addMessage({
    conversationId: message.conversationId,
    role: 'assistant',
    content: '',
    modelDisplayName,
    status: 'created',
  })

  // 广播 AI 消息创建事件
  await emitToUser<ChatMessageCreated>(user.id, 'chat.message.created', {
    conversationId: message.conversationId,
    message: {
      id: assistantMessage.id,
      conversationId: message.conversationId,
      role: 'assistant',
      content: '',
      files: null,
      modelDisplayName,  // AI 消息的模型显示名称
      status: 'created',
      mark: null,
      sortId: null,
      createdAt: assistantMessage.createdAt,
      updatedAt: assistantMessage.updatedAt,
    },
  })

  // 异步启动流式生成任务
  setImmediate(() => {
    startStreamingTask({
      messageId: assistantMessage.id,
      userMessageId: replayUserMessageId,  // 传递重放的用户消息 ID
      conversationId: message.conversationId,
      userId: user.id,
      userContent: userMessageContent,
    }).catch(err => {
      console.error('重放流式生成任务失败:', err)
    })
  })

  // 返回新创建的 AI 消息 ID
  return {
    assistantMessageId: assistantMessage.id,
  }
})

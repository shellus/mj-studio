// POST /api/conversations/[id]/messages - 发送消息
// 同时创建用户消息和 AI 消息，返回两个消息 ID，后端异步开始生成
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useAimodelService } from '../../../services/aimodel'
import { startStreamingTask } from '../../../services/streamingTask'
import type { MessageMark, MessageFile } from '../../../database/schema'
import { MESSAGE_MARK } from '../../../../app/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '对话ID不能为空' })
  }

  const conversationId = parseInt(id, 10)
  if (isNaN(conversationId)) {
    throw createError({ statusCode: 400, message: '无效的对话ID' })
  }

  const body = await readBody(event)
  const { content, files, isCompressRequest = false } = body as {
    content: string
    files?: MessageFile[]
    isCompressRequest?: boolean
  }

  // 调试日志
  console.log('[Messages] 收到请求 | content:', content?.slice(0, 30), '| files:', files?.length ?? 0, '个文件')
  if (files?.length) {
    console.log('[Messages] 文件详情:', files.map(f => `${f.name} (${f.mimeType})`).join(', '))
  }

  if (!content?.trim() && (!files || files.length === 0)) {
    throw createError({ statusCode: 400, message: '消息内容不能为空' })
  }

  // 获取对话验证权限
  const conversationService = useConversationService()
  const result = await conversationService.getWithMessages(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 获取助手和模型信息，用于设置 modelDisplayName
  const assistantService = useAssistantService()
  const aimodelService = useAimodelService()

  const assistant = await assistantService.getById(result.conversation.assistantId)
  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  // 获取模型显示名称（格式：上游 / 模型名称）
  let modelDisplayName: string | null = null
  if (assistant.aimodelId) {
    const aimodelWithUpstream = await aimodelService.getByIdWithUpstream(assistant.aimodelId)
    if (aimodelWithUpstream) {
      modelDisplayName = `${aimodelWithUpstream.upstreamName} / ${aimodelWithUpstream.name}`
    }
  }

  // 压缩请求特殊处理：用户消息已在 compress.post.ts 中创建
  let userMessage = null
  let responseMark: MessageMark | undefined = undefined
  let responseSortId: number | undefined = undefined

  if (isCompressRequest) {
    // 找到最新的压缩请求消息（按 ID 降序），获取其 sortId
    const compressRequestMsg = result.messages
      .filter(m => m.mark === MESSAGE_MARK.COMPRESS_REQUEST)
      .sort((a, b) => b.id - a.id)[0]
    if (compressRequestMsg) {
      responseSortId = (compressRequestMsg.sortId || compressRequestMsg.id) + 1
      responseMark = 'compress-response'
    }
  } else {
    // 普通消息：创建用户消息（service.addMessage 会自动广播 chat.message.created 事件）
    userMessage = await conversationService.addMessage(user.id, {
      conversationId,
      role: 'user',
      content: content?.trim() || '',
      files: files && files.length > 0 ? files : undefined,
    })

    // 如果是首条消息，更新对话标题（service.updateTitle 会自动广播 chat.conversation.updated 事件）
    if (result.messages.length === 0) {
      const title = conversationService.generateTitle(content?.trim() || (files?.[0]?.name || '新对话'))
      await conversationService.updateTitle(conversationId, user.id, title)
    }
  }

  // 创建 AI 消息（status: created，content 为空）
  // service.addMessage 会自动广播 chat.message.created 事件
  const assistantMessage = await conversationService.addMessage(user.id, {
    conversationId,
    role: 'assistant',
    content: '', // 初始内容为空
    modelDisplayName: modelDisplayName ?? undefined, // 设置模型显示名称
    status: 'created',
    mark: responseMark,
    sortId: responseSortId,
  })

  // 异步启动流式生成任务（不阻塞响应）
  // 使用 setImmediate 确保在响应返回后执行
  setImmediate(() => {
    startStreamingTask({
      messageId: assistantMessage.id,
      userMessageId: userMessage?.id ?? null,  // 传递用户消息 ID，压缩请求时为 null
      conversationId,
      userId: user.id,
      userContent: content?.trim() || '',
      userFiles: files,
      isCompressRequest,
      responseMark,
      responseSortId,
    }).catch(err => {
      console.error('流式生成任务失败:', err)
    })
  })

  // 立即返回两个消息 ID
  return {
    userMessageId: userMessage?.id ?? null,
    assistantMessageId: assistantMessage.id,
  }
})

// POST /api/conversations/[id]/messages - 发送消息
// 同时创建用户消息和 AI 消息，返回两个消息 ID，后端异步开始生成
import { useConversationService } from '../../../services/conversation'
import { startStreamingTask } from '../../../services/streamingTask'
import type { MessageMark } from '../../../database/schema'

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
  const { content, isCompressRequest = false } = body

  if (!content?.trim()) {
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

  // 压缩请求特殊处理：用户消息已在 compress.post.ts 中创建
  let userMessage = null
  let responseMark: MessageMark | undefined = undefined
  let responseSortId: number | undefined = undefined

  if (isCompressRequest) {
    // 找到压缩请求消息，获取其 sortId
    const compressRequestMsg = result.messages.find(m => m.mark === 'compress-request' && m.content === content.trim())
    if (compressRequestMsg) {
      responseSortId = (compressRequestMsg.sortId || compressRequestMsg.id) + 1
      responseMark = 'compress-response'
    }
  } else {
    // 普通消息：创建用户消息
    userMessage = await conversationService.addMessage({
      conversationId,
      role: 'user',
      content: content.trim(),
    })

    // 如果是首条消息，更新对话标题
    if (result.messages.length === 0) {
      const title = conversationService.generateTitle(content.trim())
      await conversationService.updateTitle(conversationId, user.id, title)
    }
  }

  // 创建 AI 消息（status: created，content 为空）
  const assistantMessage = await conversationService.addMessage({
    conversationId,
    role: 'assistant',
    content: '', // 初始内容为空
    status: 'created',
    mark: responseMark,
    sortId: responseSortId,
  })

  // 异步启动流式生成任务（不阻塞响应）
  // 使用 setImmediate 确保在响应返回后执行
  setImmediate(() => {
    startStreamingTask({
      messageId: assistantMessage.id,
      conversationId,
      userId: user.id,
      userContent: content.trim(),
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

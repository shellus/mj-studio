// POST /api/conversations/[id]/messages - 发送消息（流式响应）
import { useConversationService } from '../../../services/conversation'
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService, writeStreamToResponse } from '../../../services/chat'
import type { MessageMark } from '../../../database/schema'
import type { LogContext } from '../../../utils/logger'

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
  const { content, stream = true, isCompressRequest = false } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, message: '消息内容不能为空' })
  }

  // 获取对话和消息
  const conversationService = useConversationService()
  const result = await conversationService.getWithMessages(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  // 获取助手
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(result.conversation.assistantId)

  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  // 获取模型配置
  if (!assistant.modelConfigId || !assistant.modelName) {
    throw createError({ statusCode: 400, message: '请先为助手配置模型' })
  }

  const modelConfigService = useModelConfigService()
  const modelConfig = await modelConfigService.getById(assistant.modelConfigId)

  if (!modelConfig) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 压缩请求特殊处理：不保存用户消息（已在 compress.post.ts 中保存）
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
    // 普通消息：保存用户消息
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

  // 构建历史消息上下文
  let historyMessages = result.messages

  if (isCompressRequest) {
    // 压缩请求：发送待压缩的消息（从上次压缩点到压缩请求之前）
    // 找到压缩请求消息的位置
    const compressRequestIndex = result.messages.findIndex(m => m.mark === 'compress-request')
    if (compressRequestIndex > 0) {
      // 找到上次压缩点
      let startIndex = 0
      for (let i = compressRequestIndex - 1; i >= 0; i--) {
        if (result.messages[i].mark === 'compress-response') {
          startIndex = i
          break
        }
      }
      // 待压缩消息：从上次压缩点到压缩请求之前（不包含压缩请求）
      historyMessages = result.messages.slice(startIndex, compressRequestIndex)
    }
  } else {
    // 普通消息：从最后一个 compress-response 消息开始（包含它）
    // 排除 compress-request 消息
    for (let i = result.messages.length - 1; i >= 0; i--) {
      if (result.messages[i].mark === 'compress-response') {
        historyMessages = result.messages.slice(i).filter(m => m.mark !== 'compress-request')
        break
      }
    }
    // 如果没有压缩点，也要排除 compress-request
    historyMessages = historyMessages.filter(m => m.mark !== 'compress-request')
  }

  // 创建聊天服务
  const chatService = createChatService(modelConfig)

  // 构建日志上下文
  const logContext: LogContext = {
    type: isCompressRequest ? '压缩' : '聊天',
    conversationId,
    conversationTitle: result.conversation.title,
  }

  if (stream) {
    // 流式响应
    setHeader(event, 'Content-Type', 'text/event-stream')
    setHeader(event, 'Cache-Control', 'no-cache')
    setHeader(event, 'Connection', 'keep-alive')

    try {
      const generator = chatService.chatStream(
        assistant.modelName,
        assistant.systemPrompt,
        historyMessages,
        content.trim(),
        undefined,
        logContext
      )

      const fullContent = await writeStreamToResponse(event, generator, conversationId, user.id)

      // 保存助手消息
      if (fullContent) {
        await conversationService.addMessage({
          conversationId,
          role: 'assistant',
          content: fullContent,
          modelConfigId: assistant.modelConfigId,
          modelName: assistant.modelName,
          mark: responseMark,
          sortId: responseSortId,
        })
      }

      return
    } catch (error: any) {
      const errorMessage = error.message || '生成失败'
      // 保存错误消息到数据库
      await conversationService.addMessage({
        conversationId,
        role: 'assistant',
        content: errorMessage,
        modelConfigId: assistant.modelConfigId,
        modelName: assistant.modelName,
        mark: 'error',
      })
      // 发送错误到前端
      const errorData = JSON.stringify({ error: errorMessage, done: true })
      event.node.res.write(`data: ${errorData}\n\n`)
      return
    }
  } else {
    // 非流式响应
    const response = await chatService.chat(
      assistant.modelName,
      assistant.systemPrompt,
      historyMessages,
      content.trim(),
      undefined,
      logContext
    )

    if (!response.success) {
      throw createError({ statusCode: 500, message: response.error || '生成失败' })
    }

    // 保存助手消息
    const assistantMessage = await conversationService.addMessage({
      conversationId,
      role: 'assistant',
      content: response.content!,
      modelConfigId: assistant.modelConfigId,
      modelName: assistant.modelName,
      mark: responseMark,
      sortId: responseSortId,
    })

    return {
      userMessage,
      assistantMessage,
    }
  }
})

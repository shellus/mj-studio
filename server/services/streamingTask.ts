// 流式生成服务
// 独立的后台任务，负责请求上游并管理生成状态
// 实现"后端独立状态机"模式

import { useConversationService } from './conversation'
import { useAssistantService } from './assistant'
import { useModelConfigService } from './modelConfig'
import { createChatService } from './chat'
import {
  startStreamingSession,
  updateSessionStatus,
  appendStreamingContent,
  endStreamingSession,
  broadcastToSubscribers,
  getStreamingSession,
  getSessionAbortController,
} from './streamingCache'
import type { Message, MessageMark, MessageStatus } from '../database/schema'
import type { LogContext } from '../utils/logger'

interface StreamingTaskParams {
  messageId: number           // AI 消息 ID
  conversationId: number
  userId: number
  userContent: string         // 用户消息内容
  isCompressRequest?: boolean
  responseMark?: MessageMark
  responseSortId?: number
}

// 启动流式生成任务（异步，不阻塞）
export async function startStreamingTask(params: StreamingTaskParams): Promise<void> {
  const {
    messageId,
    conversationId,
    userId,
    userContent,
    isCompressRequest = false,
    responseMark,
    responseSortId,
  } = params

  const conversationService = useConversationService()
  const assistantService = useAssistantService()
  const modelConfigService = useModelConfigService()

  // 创建 AbortController 用于中止
  const abortController = new AbortController()

  // 开始流式会话
  startStreamingSession(messageId, conversationId, userId, abortController)

  try {
    // 获取对话和消息
    const result = await conversationService.getWithMessages(conversationId)
    if (!result) {
      throw new Error('对话不存在')
    }

    // 获取助手
    const assistant = await assistantService.getById(result.conversation.assistantId)
    if (!assistant) {
      throw new Error('助手不存在')
    }

    // 获取模型配置
    if (!assistant.modelConfigId || !assistant.modelName) {
      throw new Error('请先为助手配置模型')
    }

    const modelConfig = await modelConfigService.getById(assistant.modelConfigId)
    if (!modelConfig) {
      throw new Error('模型配置不存在')
    }

    // 构建历史消息上下文
    let historyMessages = result.messages

    if (isCompressRequest) {
      // 压缩请求：发送待压缩的消息（从上次压缩点到压缩请求之前）
      const compressRequestIndex = result.messages.findIndex(m => m.mark === 'compress-request')
      if (compressRequestIndex > 0) {
        let startIndex = 0
        for (let i = compressRequestIndex - 1; i >= 0; i--) {
          const msg = result.messages[i]
          if (msg && msg.mark === 'compress-response') {
            startIndex = i
            break
          }
        }
        historyMessages = result.messages.slice(startIndex, compressRequestIndex)
      }
    } else {
      // 普通消息：从最后一个 compress-response 消息开始（包含它）
      // 排除 compress-request 消息和当前的 AI 消息（status 为非 completed 的）
      for (let i = result.messages.length - 1; i >= 0; i--) {
        const msg = result.messages[i]
        if (msg && msg.mark === 'compress-response') {
          historyMessages = result.messages.slice(i)
          break
        }
      }
      // 排除 compress-request 和当前正在生成的消息
      historyMessages = historyMessages.filter(m =>
        m.mark !== 'compress-request' && m.id !== messageId
      )
    }

    // 更新状态为 pending
    await conversationService.updateMessageStatus(messageId, 'pending')
    updateSessionStatus(messageId, 'pending')

    // 创建聊天服务
    const chatService = createChatService(modelConfig)

    // 构建日志上下文
    const logContext: LogContext = {
      type: isCompressRequest ? '压缩' : '聊天',
      conversationId,
      conversationTitle: result.conversation.title,
    }

    // 发起流式请求
    const generator = chatService.chatStream(
      assistant.modelName,
      assistant.systemPrompt,
      historyMessages,
      userContent,
      abortController.signal,
      logContext
    )

    let fullContent = ''
    let firstChunkReceived = false

    for await (const chunk of generator) {
      // 检查是否被中止
      if (abortController.signal.aborted) {
        break
      }

      if (chunk.content) {
        fullContent += chunk.content

        // 首个内容块：更新状态为 streaming
        if (!firstChunkReceived) {
          firstChunkReceived = true
          await conversationService.updateMessageStatus(messageId, 'streaming')
          updateSessionStatus(messageId, 'streaming')
        }

        // 追加到缓存
        appendStreamingContent(messageId, chunk.content)

        // 广播给订阅者
        await broadcastToSubscribers(messageId, { content: chunk.content, done: false })
      }

      if (chunk.done) {
        break
      }
    }

    // 检查是否被中止
    if (abortController.signal.aborted) {
      // 被中止的情况：保存已生成的内容，状态设为 stopped
      const cachedContent = endStreamingSession(messageId)
      const contentToSave = cachedContent || fullContent
      await conversationService.updateMessageContentAndStatus(messageId, contentToSave, 'stopped', responseMark)

      // 广播完成信号
      await broadcastToSubscribers(messageId, { done: true, status: 'stopped' })
      return
    }

    // 正常完成：保存内容并更新状态
    await conversationService.updateMessageContentAndStatus(messageId, fullContent, 'completed', responseMark)
    endStreamingSession(messageId)

    // 广播完成信号
    await broadcastToSubscribers(messageId, { done: true, status: 'completed' })

  } catch (error: any) {
    // 错误处理：保存错误信息
    const errorMessage = error.message || '生成失败'
    const cachedContent = endStreamingSession(messageId)

    // 更新消息为错误状态
    await conversationService.updateMessageContentAndStatus(
      messageId,
      errorMessage,
      'failed',
      'error'
    )

    // 广播错误
    await broadcastToSubscribers(messageId, { error: errorMessage, done: true, status: 'failed' })
  }
}

// 停止正在进行的生成任务
export async function stopStreamingTask(messageId: number): Promise<boolean> {
  const conversationService = useConversationService()

  // 获取 AbortController 并中止
  const abortController = getSessionAbortController(messageId)
  if (abortController) {
    abortController.abort()
  }

  // 获取缓存内容
  const session = getStreamingSession(messageId)
  if (!session) {
    // 没有活跃会话，可能已经完成
    return false
  }

  // 保存已生成的内容
  const cachedContent = endStreamingSession(messageId)
  await conversationService.updateMessageContentAndStatus(messageId, cachedContent, 'stopped')

  // 广播停止信号
  await broadcastToSubscribers(messageId, { done: true, status: 'stopped' })

  return true
}

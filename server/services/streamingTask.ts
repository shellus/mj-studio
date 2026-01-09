// 流式生成服务
// 独立的后台任务，负责请求上游并管理生成状态
// 实现"后端独立状态机"模式

import { useConversationService } from './conversation'
import { useAssistantService } from './assistant'
import { useUpstreamService } from './upstream'
import { useAimodelService } from './aimodel'
import { createChatService } from './chat'
import { createClaudeChatService } from './claude'
import {
  startStreamingSession,
  updateSessionStatus,
  appendStreamingContent,
  endStreamingSession,
  getStreamingSession,
  getSessionAbortController,
  getStreamingContent,  // 新增：获取内容但不清理
} from './streamingCache'
import { emitToUser } from './globalEvents'
import type { ChatMessageDone } from './globalEvents'
import type { MessageMark, MessageFile } from '../database/schema'
import type { LogContext } from '../utils/logger'
import { getErrorMessage } from '../../app/shared/types'

interface StreamingTaskParams {
  messageId: number           // AI 消息 ID
  userMessageId: number | null // 用户消息 ID（压缩请求时为 null）
  conversationId: number
  userId: number
  userContent: string         // 用户消息内容
  userFiles?: MessageFile[]   // 用户消息附件
  isCompressRequest?: boolean
  responseMark?: MessageMark
  responseSortId?: number
}

// 启动流式生成任务（异步，不阻塞）
export async function startStreamingTask(params: StreamingTaskParams): Promise<void> {
  const {
    messageId,
    userMessageId,
    conversationId,
    userId,
    userContent,
    userFiles,
    isCompressRequest = false,
    responseMark,
    responseSortId,
  } = params

  const conversationService = useConversationService()
  const assistantService = useAssistantService()
  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

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
    if (!assistant.aimodelId) {
      throw new Error('请先为助手配置模型')
    }

    const aimodel = await aimodelService.getById(assistant.aimodelId)
    if (!aimodel) {
      throw new Error('模型配置不存在')
    }

    const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
    if (!upstream) {
      throw new Error('上游配置不存在')
    }

    // 从助手配置读取思考开关
    const enableThinking = assistant.enableThinking || false

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
      // 排除：compress-request 消息、当前 AI 消息、当前用户消息（会通过 userContent 单独传递）
      historyMessages = historyMessages.filter(m =>
        m.mark !== 'compress-request'
        && m.id !== messageId  // 排除当前 AI 消息
        && m.id !== userMessageId  // 排除当前用户消息（用 ID 精确匹配）
      )
    }

    // 更新状态为 pending
    await conversationService.updateMessageStatus(messageId, 'pending')
    updateSessionStatus(messageId, 'pending')

    // 使用 aimodel 中的 apiFormat 和 keyName
    const apiFormat = aimodel.apiFormat
    const keyName = aimodel.keyName

    // 根据 apiFormat 创建对应的聊天服务
    const chatService = apiFormat === 'claude'
      ? createClaudeChatService(upstream, keyName)
      : createChatService(upstream, keyName)

    // 构建日志上下文
    const logContext: LogContext = {
      type: isCompressRequest ? '压缩' : '聊天',
      conversationId,
      conversationTitle: result.conversation.title,
      keyName,
    }

    // 发起流式请求
    const generator = chatService.chatStream(
      aimodel.modelName,
      assistant.systemPrompt,
      historyMessages,
      userContent,
      userFiles,
      abortController.signal,
      logContext,
      conversationId,
      messageId,
      enableThinking
    )

    let fullContent = ''
    let fullThinking = ''  // 思考内容
    let thinkingStarted = false  // 是否已输出思考开标签
    let thinkingEnded = false    // 是否已输出思考闭标签
    let firstChunkReceived = false
    const requestStartTime = Date.now() // 记录请求开始时间
    let updatedEstimatedTime: number | null = null // 记录更新后的预计时间

    for await (const chunk of generator) {
      // 检查是否被中止
      if (abortController.signal.aborted) {
        break
      }

      // 处理思考内容
      if (chunk.thinking) {
        fullThinking += chunk.thinking
        // 首次收到思考内容时，输出开标签
        if (!thinkingStarted) {
          thinkingStarted = true
          appendStreamingContent(messageId, '<thinking>\n')
        }
        appendStreamingContent(messageId, chunk.thinking)
      }

      if (chunk.content) {
        // 如果有思考内容且尚未闭合，先输出闭标签
        if (thinkingStarted && !thinkingEnded) {
          thinkingEnded = true
          appendStreamingContent(messageId, '\n</thinking>\n\n')
        }

        fullContent += chunk.content

        // 首个内容块：更新状态为 streaming，并更新预计首字时长
        if (!firstChunkReceived) {
          firstChunkReceived = true
          await conversationService.updateMessageStatus(messageId, 'streaming')
          updateSessionStatus(messageId, 'streaming')

          // 计算首字耗时并更新模型配置的预计时间
          const firstChunkTime = (Date.now() - requestStartTime) / 1000
          try {
            updatedEstimatedTime = await aimodelService.updateEstimatedTime(
              aimodel.id,
              firstChunkTime
            )
          } catch (err) {
            console.error('更新预计首字时长失败:', err)
          }
        }

        // 追加到缓存并立即广播给订阅者（无聚合策略）
        appendStreamingContent(messageId, chunk.content)
      }

      if (chunk.done) {
        break
      }
    }

    // 检查是否被中止
    if (abortController.signal.aborted) {
      // 如果有未闭合的思考标签，需要闭合
      if (thinkingStarted && !thinkingEnded) {
        appendStreamingContent(messageId, '\n</thinking>\n\n')
      }

      // 被中止的情况：保存已生成的内容，状态设为 stopped
      const cachedContent = getStreamingContent(messageId)  // 获取内容但不清理
      const contentToSave = cachedContent || fullContent
      await conversationService.updateMessageContentAndStatus(messageId, contentToSave, 'stopped', responseMark)

      // 广播 done 事件（在清理缓存之前）
      await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
        conversationId,
        messageId,
        status: 'stopped',
        ...(updatedEstimatedTime !== null ? {
          estimatedTime: updatedEstimatedTime,
          upstreamId: aimodel.upstreamId,
          aimodelId: aimodel.id,
        } : {}),
      })

      // 延迟清理缓存，给 /stream 订阅者时间接收完所有内容
      setTimeout(() => {
        endStreamingSession(messageId)
      }, 2000)
      return
    }

    // 正常完成：保存内容并更新状态

    // 如果有未闭合的思考标签，需要闭合
    if (thinkingStarted && !thinkingEnded) {
      appendStreamingContent(messageId, '\n</thinking>\n\n')
    }

    // 使用缓存的完整内容（包含标签），保持与流式输出一致
    const cachedContent = getStreamingContent(messageId)
    const finalContent = cachedContent || (fullThinking
      ? `<thinking>\n${fullThinking}\n</thinking>\n\n${fullContent}`
      : fullContent)

    // 保存内容并更新状态
    await conversationService.updateMessageContentAndStatus(messageId, finalContent, 'completed', responseMark)

    // 广播 done 事件（在清理缓存之前）
    await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
      conversationId,
      messageId,
      status: 'completed',
      ...(updatedEstimatedTime !== null ? {
        estimatedTime: updatedEstimatedTime,
        upstreamId: aimodel.upstreamId,
        aimodelId: aimodel.id,
      } : {}),
    })

    // 延迟清理缓存，给 /stream 订阅者时间接收完所有内容
    setTimeout(() => {
      endStreamingSession(messageId)
    }, 2000)  // 延迟 2 秒

  } catch (error: unknown) {
    // 错误处理：保存错误信息
    const errorMessage = getErrorMessage(error)

    // 更新消息为错误状态
    await conversationService.updateMessageContentAndStatus(
      messageId,
      errorMessage,
      'failed',
      'error'
    )

    // 广播 done 事件（带错误）
    await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
      conversationId,
      messageId,
      status: 'failed',
      error: errorMessage,
    })

    // 延迟清理缓存
    setTimeout(() => {
      endStreamingSession(messageId)
    }, 2000)
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

  // 广播 done 事件
  await emitToUser<ChatMessageDone>(session.userId, 'chat.message.done', {
    conversationId: session.conversationId,
    messageId,
    status: 'stopped',
  })

  return true
}

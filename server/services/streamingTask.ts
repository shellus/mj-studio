// 流式生成服务
// 独立的后台任务，负责请求上游并管理生成状态
// 实现"后端独立状态机"模式

import { useConversationService } from './conversation'
import { useAssistantService } from './assistant'
import { useUpstreamService } from './upstream'
import { useAimodelService } from './aimodel'
import { getChatProvider } from './chatProviders'
import type { ChatApiFormat } from './chatProviders'
import {
  startStreamingSession,
  updateSessionStatus,
  updateThinkingState,
  getThinkingState,
  appendStreamingContent,
  endStreamingSession,
  getStreamingSession,
  getSessionAbortController,
  getStreamingContent,
  tryFinalizeSession,
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
    const apiFormat = aimodel.apiFormat as ChatApiFormat
    const keyName = aimodel.keyName

    // 根据 apiFormat 获取对应的 ChatProvider
    const chatProvider = getChatProvider(apiFormat)
    if (!chatProvider) {
      throw new Error(`不支持的聊天 API 格式: ${apiFormat}`)
    }
    const chatService = chatProvider.createService(upstream, keyName)

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
          updateThinkingState(messageId, true, false)  // 同步到缓存
          appendStreamingContent(messageId, '<thinking>\n')
        }
        appendStreamingContent(messageId, chunk.thinking)
      }

      if (chunk.content) {
        // 如果有思考内容且尚未闭合，先输出闭标签
        if (thinkingStarted && !thinkingEnded) {
          thinkingEnded = true
          updateThinkingState(messageId, true, true)  // 同步到缓存
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

      // 【竞态条件处理】尝试完成会话（原子操作）
      // 这里和 stopStreamingTask() 可能同时尝试保存内容
      // 通过 tryFinalizeSession 确保只有一方成功保存，避免重复写入数据库
      // 详见 streamingCache.ts 中 tryFinalizeSession 的注释
      const finalizeResult = tryFinalizeSession(messageId)
      if (finalizeResult) {
        // 被中止的情况：保存已生成的内容，状态设为 stopped
        const contentToSave = finalizeResult.content || fullContent
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
      }
      // 如果 finalizeResult 为 null，说明已被 stopStreamingTask 处理，不需要再保存
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

/**
 * 停止正在进行的生成任务
 *
 * 【执行流程】
 * 1. 触发 abortController.abort() 中止上游请求
 * 2. 等待 100ms 给流式循环优先处理的机会
 * 3. 尝试通过 tryFinalizeSession 获取保存权
 * 4. 如果获取成功则保存内容，否则说明流式循环已处理
 *
 * 【竞态条件说明】
 * 此函数和流式循环 (startStreamingTask) 中的 abort 检测可能同时尝试保存内容。
 * 通过 tryFinalizeSession 的原子操作确保只有一方成功保存。
 *
 * 等待 100ms 的原因：
 * - 给流式循环优先处理的机会，因为它有更完整的上下文（如 responseMark）
 * - 如果流式循环在 100ms 内处理完成，tryFinalizeSession 会返回 null
 * - 如果流式循环还在等待上游响应（如思考阶段），由我们来保存内容
 */
export async function stopStreamingTask(messageId: number): Promise<boolean> {
  const conversationService = useConversationService()

  // 获取会话信息
  const session = getStreamingSession(messageId)
  if (!session) {
    // 没有活跃会话，可能已经完成
    return false
  }

  // 保存会话信息（因为后面可能会被清理）
  const { userId, conversationId } = session

  // 获取 AbortController 并中止
  const abortController = getSessionAbortController(messageId)
  if (abortController) {
    abortController.abort()
  }

  // 【关键】等待 100ms，给流式循环优先处理的机会
  // 流式循环有更完整的上下文（如 responseMark、updatedEstimatedTime 等）
  await new Promise(resolve => setTimeout(resolve, 100))

  // 【竞态条件处理】尝试获取保存权
  // 如果流式循环已经在这 100ms 内处理完成，tryFinalizeSession 会返回 null
  // 闭合未完成的思考标签
  const thinkingState = getThinkingState(messageId)
  if (thinkingState.started && !thinkingState.ended) {
    appendStreamingContent(messageId, '\n</thinking>\n\n')
  }

  const finalizeResult = tryFinalizeSession(messageId)
  if (!finalizeResult) {
    // 流式循环已经处理完成（保存了内容），我们不需要再保存
    return true
  }

  // 流式循环还没处理完（可能卡在等待上游响应，如思考阶段）
  // 由我们来保存已累积的内容
  await conversationService.updateMessageContentAndStatus(messageId, finalizeResult.content, 'stopped')

  // 广播 done 事件
  await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
    conversationId,
    messageId,
    status: 'stopped',
  })

  // 清理缓存
  endStreamingSession(messageId)

  return true
}

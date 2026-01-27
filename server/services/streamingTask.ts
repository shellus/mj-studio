// 流式生成服务
// 独立的后台任务，负责请求上游并管理生成状态
// 实现"后端独立状态机"模式

import { useConversationService } from './conversation'
import { useAssistantService } from './assistant'
import { useUpstreamService } from './upstream'
import { useAimodelService } from './aimodel'
import { getChatProvider } from './chatProviders'
import type { ChatApiFormat, ChatTool } from './chatProviders'
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
import { getErrorMessage, type ToolCallRecord } from '../../app/shared/types'
import { MESSAGE_MARK } from '../../app/shared/constants'
import { useMcpServerService } from './mcpServer'
import { useMcpClientManager, mcpToolsToChatTools, findMcpToolByDisplayName, MCP_CLIENT_CONFIG } from './mcpClient'
import type { McpToolWithServer } from './mcpClient'
import { waitForToolConfirmation, cancelPendingToolCalls, broadcastToolCallUpdated } from './toolCallState'

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

  // 记录请求开始时间（在 try 外部，以便 catch 也能访问）
  const requestStartTime = Date.now()

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

    // 从模型能力读取 Web Search 开关
    const enableWebSearch = aimodel.capabilities?.includes('web_search') || false

    // 获取助手关联的 MCP 服务和工具
    const mcpServerService = useMcpServerService()
    const mcpClientManager = useMcpClientManager()

    let mcpTools: McpToolWithServer[] = []
    let chatTools: ChatTool[] = []
    if (!isCompressRequest) {
      const mcpServers = await mcpServerService.getByAssistantId(assistant.id, userId)
      if (mcpServers.length > 0) {
        mcpTools = await mcpClientManager.getToolsForServers(userId, mcpServers)
        chatTools = mcpToolsToChatTools(mcpTools)
      }
    }

    // 构建历史消息上下文
    let historyMessages = result.messages

    if (isCompressRequest) {
      // 压缩请求：发送待压缩的消息（从上次压缩点到压缩请求之前）
      const compressRequestIndex = result.messages.findIndex(m => m.mark === MESSAGE_MARK.COMPRESS_REQUEST)
      if (compressRequestIndex > 0) {
        let startIndex = 0
        for (let i = compressRequestIndex - 1; i >= 0; i--) {
          const msg = result.messages[i]
          if (msg && msg.mark === MESSAGE_MARK.COMPRESS_RESPONSE) {
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
        if (msg && msg.mark === MESSAGE_MARK.COMPRESS_RESPONSE) {
          historyMessages = result.messages.slice(i)
          break
        }
      }
      // 排除：compress-request 消息、当前 AI 消息、当前用户消息（会通过 userContent 单独传递）
      historyMessages = historyMessages.filter(m =>
        m.mark !== MESSAGE_MARK.COMPRESS_REQUEST
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
      enableThinking,
      enableWebSearch,
      chatTools
    )

    let fullContent = ''
    let fullThinking = ''  // 思考内容
    let thinkingStarted = false  // 是否已输出思考开标签
    let thinkingEnded = false    // 是否已输出思考闭标签
    let firstChunkReceived = false
    let updatedEstimatedTime: number | null = null // 记录更新后的预计时间

    // 工具调用相关变量
    let pendingToolCalls: Array<{
      id: string
      toolUseId: string
      tool: McpToolWithServer
      args: Record<string, unknown>
    }> = []
    let toolRounds = 0  // 工具调用轮次计数
    let hasToolCallsOccurred = false  // 是否发生过工具调用（用于决定是否删除原消息）
    let currentMessageId = messageId  // 当前正在流式输出的消息 ID
    let currentToolCallRecords: ToolCallRecord[] = []  // 当前 assistant 消息中的工具调用记录

    // 执行工具调用
    async function executeToolCall(
      tool: McpToolWithServer,
      args: Record<string, unknown>
    ): Promise<{ success: boolean; content?: unknown; error?: string }> {
      const server = await mcpServerService.getById(tool.serverId, userId)
      if (!server) {
        return { success: false, error: '服务不存在' }
      }
      return mcpClientManager.callTool(userId, server, tool.name, args)
    }

    // 处理单个流式响应的 chunk
    async function processChunk(chunk: Awaited<ReturnType<typeof generator.next>>['value']): Promise<'continue' | 'tool_use' | 'done' | 'aborted'> {
      if (!chunk) return 'done'

      // 检查是否被中止
      if (abortController.signal.aborted) {
        return 'aborted'
      }

      // 处理思考内容
      if (chunk.thinking) {
        fullThinking += chunk.thinking
        if (!thinkingStarted) {
          thinkingStarted = true
          updateThinkingState(currentMessageId, true, false)
          appendStreamingContent(currentMessageId, '<thinking>\n')
        }
        appendStreamingContent(currentMessageId, chunk.thinking)
      }

      // 处理 Web Search 状态
      if (chunk.webSearch) {
        if (chunk.webSearch.status === 'searching') {
          appendStreamingContent(currentMessageId, '\n```web-search\nstatus: searching\n```\n\n')
        } else if (chunk.webSearch.status === 'completed' && chunk.webSearch.results) {
          const json = JSON.stringify(chunk.webSearch.results)
          appendStreamingContent(currentMessageId, `\n\`\`\`web-search\nstatus: completed\nresults: ${json}\n\`\`\`\n\n`)
        }
      }

      // 处理工具调用
      if (chunk.toolUse) {
        const { id: toolUseId, name, input } = chunk.toolUse
        console.log(`[MCP Tool] 收到工具调用请求: name=${name}, mcpTools count=${mcpTools.length}`)
        console.log(`[MCP Tool] 可用工具 displayNames:`, mcpTools.map(t => t.displayName))
        const tool = findMcpToolByDisplayName(mcpTools, name)

        if (tool) {
          console.log(`[MCP Tool] 找到工具: ${tool.displayName}`)
          pendingToolCalls.push({
            id: `${currentMessageId}_${toolUseId}`,
            toolUseId,
            tool,
            args: input,
          })

          // 不再在 assistant 消息中输出 tool-call 代码块
          // 工具调用信息将存储在后续的 tool 消息中
        } else {
          console.log(`[MCP Tool] 未找到工具: ${name}`)
        }
      }

      if (chunk.content) {
        // 如果有思考内容且尚未闭合，先输出闭标签
        if (thinkingStarted && !thinkingEnded) {
          thinkingEnded = true
          updateThinkingState(currentMessageId, true, true)
          appendStreamingContent(currentMessageId, '\n</thinking>\n\n')
        }

        fullContent += chunk.content

        // 首个内容块：更新状态为 streaming，并更新预计首字时长
        if (!firstChunkReceived) {
          firstChunkReceived = true
          await conversationService.updateMessageStatus(currentMessageId, 'streaming')
          updateSessionStatus(currentMessageId, 'streaming')

          // 计算首字耗时并更新模型配置的预计时间
          const firstChunkTime = (Date.now() - requestStartTime) / 1000
          try {
            updatedEstimatedTime = await aimodelService.updateEstimatedTime(
              aimodel!.id,
              firstChunkTime
            )
          } catch (err) {
            console.error('更新预计首字时长失败:', err)
          }
        }

        // 追加到缓存并立即广播给订阅者
        appendStreamingContent(currentMessageId, chunk.content)
      }

      // 检查 AI 是否因为工具调用而停止
      if (chunk.stopReason === 'tool_use') {
        console.log(`[MCP Tool] 收到 stopReason=tool_use, pendingToolCalls.length=${pendingToolCalls.length}`)
        if (pendingToolCalls.length > 0) {
          return 'tool_use'
        }
      }

      if (chunk.done) {
        console.log(`[MCP Tool] 流结束, pendingToolCalls.length=${pendingToolCalls.length}`)
        // 即使没有收到 stopReason，如果有待处理的工具调用，也返回 tool_use
        if (pendingToolCalls.length > 0) {
          console.log(`[MCP Tool] 检测到待处理工具调用，切换到工具处理模式`)
          return 'tool_use'
        }
        return 'done'
      }

      return 'continue'
    }

    // 多轮工具调用循环
    let currentGenerator = generator
    let streamResult: 'continue' | 'tool_use' | 'done' | 'aborted' = 'continue'

    while (toolRounds < MCP_CLIENT_CONFIG.maxToolRounds && !abortController.signal.aborted) {
      // 处理当前生成器的所有 chunk
      for await (const chunk of currentGenerator) {
        streamResult = await processChunk(chunk)
        if (streamResult !== 'continue') break
      }

      // 检查结果
      if (streamResult === 'aborted' || streamResult === 'done') {
        break
      }

      // 处理工具调用
      if (streamResult === 'tool_use' && pendingToolCalls.length > 0) {
        toolRounds++
        hasToolCallsOccurred = true

        // 1. 获取当前 assistant 消息内容（保持 streaming 状态）
        const currentContent = getStreamingContent(currentMessageId) || fullContent

        // 2. 初始化工具调用记录数组，追加到现有记录
        const newToolCallRecords: ToolCallRecord[] = pendingToolCalls.map(call => ({
          id: call.toolUseId,
          serverId: call.tool.serverId,
          serverName: call.tool.serverName,
          toolName: call.tool.name,
          displayName: call.tool.displayName,
          arguments: call.args,
          status: 'pending' as const,
        }))
        currentToolCallRecords = [...currentToolCallRecords, ...newToolCallRecords]

        // 3. 更新 assistant 消息的 content 和 toolCalls（状态保持 streaming）
        await conversationService.updateMessageContentAndStatus(currentMessageId, currentContent, 'streaming')
        await conversationService.updateMessageToolCalls(currentMessageId, currentToolCallRecords)

        // 4. 广播每个新工具调用的状态
        for (const record of newToolCallRecords) {
          broadcastToolCallUpdated(userId, conversationId, currentMessageId, record.id, record)
        }

        // 5. 并行等待所有工具确认，然后执行
        // 注意：使用 assistant 消息 ID 作为确认的 key
        const assistantMessageIdForConfirm = currentMessageId

        // 6. 并行处理所有工具调用
        const startIndex = currentToolCallRecords.length - pendingToolCalls.length
        await Promise.all(pendingToolCalls.map(async (call, i) => {
          const index = startIndex + i
          const { toolUseId, tool, args } = call

          // 检查是否需要用户确认
          let approved = tool.isAutoApprove
          if (!approved && assistantMessageIdForConfirm) {
            approved = await waitForToolConfirmation(assistantMessageIdForConfirm, toolUseId)
          }

          // 检查是否被中止
          if (abortController.signal.aborted) return

          let toolContent: unknown
          let isError = false
          let newStatus: ToolCallRecord['status']

          if (!approved) {
            // 用户拒绝
            toolContent = 'User declined this tool call.'
            newStatus = 'cancelled'
          } else {
            // 用户批准 - 更新状态为 invoking
            newStatus = 'invoking'
            const record = currentToolCallRecords[index]
            if (record) {
              record.status = 'invoking'
              // 更新数据库并广播单个工具状态
              await conversationService.updateMessageToolCalls(currentMessageId, currentToolCallRecords)
              broadcastToolCallUpdated(userId, conversationId, currentMessageId, record.id, record)
            }

            // 执行工具
            const result = await executeToolCall(tool, args)

            // 检查是否被中止
            if (abortController.signal.aborted) return

            if (result.success) {
              toolContent = result.content
              newStatus = 'done'
            } else {
              toolContent = result.error || 'Tool execution failed'
              isError = true
              newStatus = 'error'
            }
          }

          // 更新当前工具调用记录
          const record = currentToolCallRecords[index]
          if (record) {
            record.status = newStatus
            record.response = toolContent
            record.isError = isError
            // 更新数据库并广播单个工具状态
            await conversationService.updateMessageToolCalls(currentMessageId, currentToolCallRecords)
            broadcastToolCallUpdated(userId, conversationId, currentMessageId, record.id, record)
          }
        }))

        // 中止时将所有 invoking 状态的工具调用标记为 cancelled
        if (abortController.signal.aborted) {
          let hasChanges = false
          for (const record of currentToolCallRecords) {
            if (record.status === 'invoking') {
              record.status = 'cancelled'
              hasChanges = true
              broadcastToolCallUpdated(userId, conversationId, currentMessageId, record.id, record)
            }
          }
          if (hasChanges) {
            await conversationService.updateMessageToolCalls(currentMessageId, currentToolCallRecords)
          }
          break
        }

        const hasToolResults = currentToolCallRecords.length > 0

        // 清空待处理列表
        pendingToolCalls = []

        // 检查是否被中止
        if (abortController.signal.aborted) break

        // 如果有工具结果，继续调用 AI（使用同一个 assistant 消息）
        if (hasToolResults) {
          // 重新获取历史消息（包含当前 assistant 消息及其 toolCalls）
          const updatedResult = await conversationService.getWithMessages(conversationId)
          if (updatedResult) {
            historyMessages = updatedResult.messages.filter(m =>
              m.mark !== MESSAGE_MARK.COMPRESS_REQUEST
            )
          }

          // 继续调用 AI（不传 userMessage，因为上下文已在历史消息中）
          currentGenerator = chatService.chatStream(
            aimodel.modelName,
            assistant.systemPrompt,
            historyMessages,
            undefined,  // 不再传 userMessage
            undefined,  // 不再传 userFiles
            abortController.signal,
            logContext,
            conversationId,
            currentMessageId,
            enableThinking,
            enableWebSearch,
            chatTools
          )
          // 继续循环处理新的生成器
          streamResult = 'continue'
        } else {
          break
        }
      } else {
        break
      }
    }

    // 如果达到最大轮次限制，输出提示
    if (toolRounds >= MCP_CLIENT_CONFIG.maxToolRounds && !abortController.signal.aborted) {
      appendStreamingContent(currentMessageId, '\n\n*[已达到最大工具调用轮次限制]*\n')
    }

    // 检查是否被中止
    if (abortController.signal.aborted) {
      // 如果有未闭合的思考标签，需要闭合
      if (thinkingStarted && !thinkingEnded) {
        appendStreamingContent(currentMessageId, '\n</thinking>\n\n')
      }

      // 【竞态条件处理】尝试完成会话（原子操作）
      const finalizeResult = tryFinalizeSession(currentMessageId)
      if (finalizeResult) {
        const contentToSave = finalizeResult.content || fullContent
        const duration = Date.now() - requestStartTime
        await conversationService.updateMessageContentAndStatus(currentMessageId, contentToSave, 'stopped', responseMark, duration)

        await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
          conversationId,
          messageId: currentMessageId,
          status: 'stopped',
          duration,
          ...(updatedEstimatedTime !== null ? {
            estimatedTime: updatedEstimatedTime,
            upstreamId: aimodel.upstreamId,
            aimodelId: aimodel.id,
          } : {}),
        })

        setTimeout(() => {
          endStreamingSession(currentMessageId)
        }, 2000)
      }
      return
    }

    // 正常完成：保存内容并更新状态

    // 如果有未闭合的思考标签，需要闭合
    if (thinkingStarted && !thinkingEnded) {
      appendStreamingContent(currentMessageId, '\n</thinking>\n\n')
    }

    // 使用缓存的完整内容（包含标签），保持与流式输出一致
    const cachedContent = getStreamingContent(currentMessageId)
    const finalContent = cachedContent || (fullThinking
      ? `<thinking>\n${fullThinking}\n</thinking>\n\n${fullContent}`
      : fullContent)

    // 计算生成耗时
    const duration = Date.now() - requestStartTime

    // 更新当前消息内容和状态
    await conversationService.updateMessageContentAndStatus(currentMessageId, finalContent, 'completed', responseMark, duration)

    // 广播 done 事件
    await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
      conversationId,
      messageId: currentMessageId,
      status: 'completed',
      duration,
      ...(updatedEstimatedTime !== null ? {
        estimatedTime: updatedEstimatedTime,
        upstreamId: aimodel.upstreamId,
        aimodelId: aimodel.id,
      } : {}),
    })

    // 延迟清理缓存
    setTimeout(() => {
      endStreamingSession(currentMessageId)
    }, 2000)

  } catch (error: unknown) {
    // 错误处理：保存错误信息
    const errorMessage = getErrorMessage(error)
    const duration = Date.now() - requestStartTime

    // 更新消息为错误状态
    await conversationService.updateMessageContentAndStatus(
      messageId,
      errorMessage,
      'failed',
      'error',
      duration
    )

    // 广播 done 事件（带错误）
    await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
      conversationId,
      messageId,
      status: 'failed',
      error: errorMessage,
      duration,
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

  // 取消所有待确认的工具调用
  cancelPendingToolCalls(messageId)

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
  const duration = Date.now() - session.startedAt
  await conversationService.updateMessageContentAndStatus(messageId, finalizeResult.content, 'stopped', undefined, duration)

  // 广播 done 事件
  await emitToUser<ChatMessageDone>(userId, 'chat.message.done', {
    conversationId,
    messageId,
    status: 'stopped',
    duration,
  })

  // 清理缓存
  endStreamingSession(messageId)

  return true
}

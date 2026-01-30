/**
 * OpenAI Chat API Provider
 *
 * 支持 OpenAI 及兼容 API 的对话服务。
 * 端点: POST /v1/chat/completions
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk, ChatTool, ToolUseRequest } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { OPENAI_REASONING_EFFORT } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError, type ToolCallRecord } from '../../../app/shared/types'
import { buildReasoningParams } from './reasoning'

// OpenAI 多模态消息内容类型
type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

// OpenAI tool_calls 格式
interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ChatMessageContent[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

// 将文件转换为多模态消息内容
function filesToContent(files: MessageFile[]): ChatMessageContent[] {
  const contents: ChatMessageContent[] = []

  for (const file of files) {
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        contents.push({
          type: 'image_url',
          image_url: { url: base64, detail: 'auto' },
        })
      }
    }
  }

  return contents
}

// 构建单条消息的 content（支持多模态）
function buildMessageContent(text: string, files?: MessageFile[] | null): string | ChatMessageContent[] {
  if (!files || files.length === 0) {
    return text
  }

  const contents: ChatMessageContent[] = []

  if (text) {
    contents.push({ type: 'text', text })
  }

  const fileContents = filesToContent(files)
  contents.push(...fileContents)

  const firstContent = contents[0]
  if (contents.length === 1 && firstContent?.type === 'text') {
    return text
  }

  return contents
}

export const openaiChatProvider: ChatProvider = {
  apiFormat: 'openai-chat',
  label: 'OpenAI Chat',

  createService(upstream: Upstream, keyName?: string): ChatService {
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, keyName)

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    function buildMessages(
      systemPrompt: string | null,
      historyMessages: Message[],
      userMessage?: string,
      userFiles?: MessageFile[]
    ): ChatMessage[] {
      const messages: ChatMessage[] = []

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt })
      }

      for (let i = 0; i < historyMessages.length; i++) {
        const msg = historyMessages[i]
        if (!msg) continue

        if (msg.role === 'user') {
          messages.push({
            role: 'user',
            content: buildMessageContent(msg.content, msg.files),
          })
        } else if (msg.role === 'assistant') {
          // 检查是否有工具调用记录
          const toolCallRecords = msg.toolCalls || []

          if (toolCallRecords.length > 0) {
            const toolCalls: OpenAIToolCall[] = toolCallRecords.map(record => ({
              id: record.id,
              type: 'function' as const,
              function: {
                name: record.displayName || record.toolName,
                arguments: JSON.stringify(record.arguments),
              },
            }))
            messages.push({
              role: 'assistant',
              content: msg.content || null,
              tool_calls: toolCalls,
            })

            // 为每个工具调用创建 tool 消息
            for (const record of toolCallRecords) {
              const responseContent = typeof record.response === 'string'
                ? record.response
                : JSON.stringify(record.response)
              messages.push({
                role: 'tool',
                content: responseContent,
                tool_call_id: record.id,
              })
            }
          } else {
            messages.push({
              role: 'assistant',
              content: buildMessageContent(msg.content, msg.files),
            })
          }
        }
      }

      // 如果有当前用户消息（首次请求时）
      if (userMessage) {
        messages.push({
          role: 'user',
          content: buildMessageContent(userMessage, userFiles),
        })
      }

      return messages
    }

    return {
      async chat(
        modelName: string,
        systemPrompt: string | null,
        historyMessages: Message[],
        userMessage: string,
        userFiles?: MessageFile[],
        signal?: AbortSignal,
        logContext?: LogContext
      ): Promise<ChatResult> {
        const url = `${upstream.baseUrl}/v1/chat/completions`
        const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        if (logContext) {
          const ctx = { ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }
          const systemPromptSize = systemPrompt ? calcSize(systemPrompt) : 0
          const historySize = historyMessages.reduce((sum, m) => sum + calcSize(m.content), 0)
          const currentSize = calcSize(userMessage)

          if (logContext.type === '压缩') {
            logCompressRequest(ctx, historyMessages.length, historySize, systemPromptSize)
          } else {
            logRequest(ctx, {
              systemPromptSize,
              historyCount: historyMessages.length,
              historySize,
              currentSize,
              enableThinking: false,
              apiFormat: 'openai-chat',
            })
          }
        }

        const body = {
          model: modelName,
          messages,
          stream: false,
        }

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
            if (logContext) {
              logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMsg)
            }
            return { success: false, error: errorMsg }
          }

          const data = await response.json()
          const content = data.choices?.[0]?.message?.content || ''
          const durationMs = Date.now() - startTime

          if (logContext) {
            logResponse({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, calcSize(content), durationMs)
          }

          return { success: true, content }
        } catch (error: unknown) {
          if (isAbortError(error)) {
            return { success: false, error: '请求已取消' }
          }
          const errorMsg = getErrorMessage(error)
          if (logContext) {
            logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMsg)
          }
          return { success: false, error: errorMsg }
        }
      },

      async *chatStream(
        modelName: string,
        systemPrompt: string | null,
        historyMessages: Message[],
        userMessage?: string,
        userFiles?: MessageFile[],
        signal?: AbortSignal,
        logContext?: LogContext,
        conversationId?: number,
        messageId?: number,
        enableThinking?: boolean,
        _enableWebSearch?: boolean,
        tools?: ChatTool[]
      ): AsyncGenerator<ChatStreamChunk> {
        const url = `${upstream.baseUrl}/v1/chat/completions`
        const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        const body: Record<string, unknown> = {
          model: modelName,
          messages,
          stream: true,
        }

        // 根据模型类型构建思考参数
        if (enableThinking) {
          const reasoningParams = buildReasoningParams(modelName, true, 'medium')
          Object.assign(body, reasoningParams)
        }

        // OpenAI Web Search 参数
        if (_enableWebSearch) {
          body.web_search_options = {
            search_context_size: 'medium',
          }
        }

        // MCP 工具
        if (tools && tools.length > 0) {
          body.tools = tools.map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            },
          }))
        }

        if (conversationId !== undefined && messageId !== undefined) {
          logConversationRequest(conversationId, messageId, {
            url,
            method: 'POST',
            headers,
            body,
          })
        }

        if (logContext) {
          const ctx = { ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }
          const systemPromptSize = systemPrompt ? calcSize(systemPrompt) : 0
          const historySize = historyMessages.reduce((sum, m) => sum + calcSize(m.content), 0)
          const currentSize = userMessage ? calcSize(userMessage) : 0

          if (logContext.type === '压缩') {
            logCompressRequest(ctx, historyMessages.length, historySize, systemPromptSize)
          } else {
            logRequest(ctx, {
              systemPromptSize,
              historyCount: historyMessages.length,
              historySize,
              currentSize,
              enableThinking,
              enableWebSearch: _enableWebSearch,
              apiFormat: 'openai-chat',
            })
          }
        }

        let totalContent = ''
        // 用于累积流式 tool_calls
        const pendingToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
          })

          if (!response.ok) {
            const errorText = await response.text()
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`
            let errorBody: unknown
            try {
              errorBody = JSON.parse(errorText)
              const parsed = errorBody as { error?: { message?: string } }
              errorMessage = parsed.error?.message || errorMessage
            } catch {
              errorBody = errorText
            }

            if (conversationId !== undefined && messageId !== undefined) {
              logConversationResponse(conversationId, messageId, {
                status: response.status,
                statusText: response.statusText,
                body: errorBody,
                durationMs: Date.now() - startTime,
              })
            }

            if (logContext) {
              logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMessage)
            }
            throw new Error(errorMessage)
          }

          const reader = response.body?.getReader()
          if (!reader) {
            yield { content: '', done: true }
            return
          }

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data:')) continue

              const data = trimmed.slice(5).trim()
              if (data === '[DONE]') {
                const durationMs = Date.now() - startTime

                if (conversationId !== undefined && messageId !== undefined) {
                  logConversationResponse(conversationId, messageId, {
                    status: 200,
                    content: totalContent,
                    durationMs,
                  })
                }

                if (logContext) {
                  logComplete({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, calcSize(totalContent), durationMs)
                }
                yield { content: '', done: true }
                return
              }

              try {
                const parsed = JSON.parse(data)
                const choice = parsed.choices?.[0]
                const delta = choice?.delta
                const finishReason = choice?.finish_reason

                const reasoningContent = delta?.reasoning_content || ''
                if (reasoningContent) {
                  yield { content: '', thinking: reasoningContent, done: false }
                }

                // 处理 tool_calls 增量
                const toolCallsDeltas = delta?.tool_calls as Array<{
                  index: number
                  id?: string
                  function?: { name?: string; arguments?: string }
                }> | undefined
                if (toolCallsDeltas) {
                  for (const tc of toolCallsDeltas) {
                    const existing = pendingToolCalls.get(tc.index)
                    if (existing) {
                      if (tc.function?.arguments) {
                        existing.arguments += tc.function.arguments
                      }
                    } else {
                      pendingToolCalls.set(tc.index, {
                        id: tc.id || '',
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || '',
                      })
                    }
                  }
                }

                // 处理 Web Search annotations（OpenAI 搜索引用）
                const annotations = delta?.annotations as Array<{
                  type: string
                  url_citation?: { url: string; title: string }
                }> | undefined
                if (annotations && annotations.length > 0) {
                  const results = annotations
                    .filter(a => a.type === 'url_citation' && a.url_citation)
                    .map(a => ({ url: a.url_citation!.url, title: a.url_citation!.title }))
                  if (results.length > 0) {
                    console.log(`[OpenAI] 收到搜索结果: ${results.length} 条`, results.map(r => r.title))
                    yield { content: '', done: false, webSearch: { status: 'completed', results } }
                  }
                }

                const content = delta?.content || ''
                if (content) {
                  totalContent += content
                  yield { content, done: false }
                }

                // 处理 finish_reason
                if (finishReason === 'tool_calls') {
                  // 输出所有收集到的 tool_calls
                  // Sort by index to ensure order
                  const sortedToolCalls = Array.from(pendingToolCalls.entries()).sort((a, b) => a[0] - b[0])
                  for (const [, tc] of sortedToolCalls) {
                    let input: Record<string, unknown> = {}
                    try {
                      input = JSON.parse(tc.arguments || '{}')
                    } catch {
                      // 忽略解析错误
                    }
                    const toolUse: ToolUseRequest = {
                      id: tc.id,
                      name: tc.name,
                      input,
                    }
                    yield { content: '', done: false, toolUse }
                  }
                  yield { content: '', done: false, stopReason: 'tool_use' }
                } else if (finishReason === 'stop') {
                  yield { content: '', done: false, stopReason: 'end_turn' }
                }
              } catch {
                // 忽略解析错误
              }
            }
          }

          const durationMs = Date.now() - startTime

          if (conversationId !== undefined && messageId !== undefined) {
            logConversationResponse(conversationId, messageId, {
              status: 200,
              content: totalContent,
              durationMs,
            })
          }

          if (logContext) {
            logComplete({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, calcSize(totalContent), durationMs)
          }
          yield { content: '', done: true }
        } catch (error: unknown) {
          const durationMs = Date.now() - startTime

          if (isAbortError(error)) {
            yield { content: '', done: true }
            return
          }

          const errorMsg = getErrorMessage(error)

          if (conversationId !== undefined && messageId !== undefined) {
            logConversationResponse(conversationId, messageId, {
              status: null,
              error: errorMsg,
              errorType: error instanceof Error ? error.name : 'Error',
              durationMs,
            })
          }

          if (logContext) {
            logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMsg)
          }
          throw error
        }
      },
    }
  },
}

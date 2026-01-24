/**
 * OpenAI Response API Provider
 *
 * 支持 OpenAI Response API 格式，优先用于 OpenAI 模型。
 * 端点: POST /v1/responses
 *
 * 与 Chat Completion API 的主要区别：
 * - 系统提示使用 instructions 字段
 * - Web Search 使用 tools: [{type: "web_search"}]
 * - 流式事件格式不同
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk, WebSearchResultItem, ChatTool, ToolUseRequest } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { OPENAI_REASONING_EFFORT } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError } from '../../../app/shared/types'

// OpenAI 多模态消息内容类型
type ResponseMessageContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }

// 工具结果类型
interface FunctionCallOutput {
  type: 'function_call_output'
  call_id: string
  output: string
}

interface ResponseMessage {
  role: 'user' | 'assistant'
  content: string | ResponseMessageContent[]
}

// 带工具调用的 assistant 消息
interface AssistantMessageWithToolCalls {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

// 将文件转换为多模态消息内容
function filesToContent(files: MessageFile[]): ResponseMessageContent[] {
  const contents: ResponseMessageContent[] = []

  for (const file of files) {
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        contents.push({
          type: 'input_image',
          image_url: base64,
          detail: 'auto',
        })
      }
    }
  }

  return contents
}

// 构建单条消息的 content（支持多模态）
function buildMessageContent(text: string, files?: MessageFile[] | null): string | ResponseMessageContent[] {
  if (!files || files.length === 0) {
    return text
  }

  const contents: ResponseMessageContent[] = []

  if (text) {
    contents.push({ type: 'input_text', text })
  }

  const fileContents = filesToContent(files)
  contents.push(...fileContents)

  const firstContent = contents[0]
  if (contents.length === 1 && firstContent?.type === 'input_text') {
    return text
  }

  return contents
}

export const openaiResponseProvider: ChatProvider = {
  apiFormat: 'openai-response',
  label: 'OpenAI Response',

  createService(upstream: Upstream, keyName?: string): ChatService {
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, keyName)

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    function buildInput(
      historyMessages: Message[],
      userMessage?: string,
      userFiles?: MessageFile[]
    ): (ResponseMessage | AssistantMessageWithToolCalls | FunctionCallOutput)[] {
      const messages: (ResponseMessage | AssistantMessageWithToolCalls | FunctionCallOutput)[] = []

      for (const msg of historyMessages) {
        if (msg.role === 'user') {
          messages.push({
            role: 'user',
            content: buildMessageContent(msg.content, msg.files),
          })
        } else if (msg.role === 'assistant') {
          // 检查是否有工具调用
          if (msg.toolCallData && msg.toolCallData.type === 'tool_use') {
            // 先添加文本内容（如果有）
            if (msg.content) {
              messages.push({
                role: 'assistant',
                content: msg.content,
              })
            }
            // 添加 function_call
            for (const call of msg.toolCallData.calls) {
              messages.push({
                type: 'function_call',
                call_id: call.id,
                name: call.name,
                arguments: JSON.stringify(call.input),
              })
            }
          } else {
            messages.push({
              role: 'assistant',
              content: buildMessageContent(msg.content, msg.files),
            })
          }
        } else if (msg.role === 'tool') {
          // tool 消息转换为 function_call_output
          if (msg.toolCallData && msg.toolCallData.type === 'tool_result') {
            messages.push({
              type: 'function_call_output',
              call_id: msg.toolCallData.toolUseId,
              output: msg.content,
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
        const url = `${upstream.baseUrl}/v1/responses`
        const input = buildInput(historyMessages, userMessage, userFiles)
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
              apiFormat: 'openai-response',
            })
          }
        }

        const body: Record<string, unknown> = {
          model: modelName,
          input,
          stream: false,
        }

        if (systemPrompt) {
          body.instructions = systemPrompt
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
          // Response API 返回格式: { output: [{ type: "message", content: [{ type: "output_text", text: "..." }] }] }
          const content = data.output?.[0]?.content?.[0]?.text || ''
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
        enableWebSearch?: boolean,
        tools?: ChatTool[]
      ): AsyncGenerator<ChatStreamChunk> {
        const url = `${upstream.baseUrl}/v1/responses`
        const input = buildInput(historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        const body: Record<string, unknown> = {
          model: modelName,
          input,
          stream: true,
        }

        if (systemPrompt) {
          body.instructions = systemPrompt
        }

        if (enableThinking) {
          body.reasoning = { effort: OPENAI_REASONING_EFFORT }
        }

        // 工具定义
        const toolsList: unknown[] = []

        // Response API Web Search 使用 tools
        if (enableWebSearch) {
          toolsList.push({ type: 'web_search_preview' })
        }

        // MCP 工具
        if (tools && tools.length > 0) {
          for (const t of tools) {
            toolsList.push({
              type: 'function',
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            })
          }
        }

        if (toolsList.length > 0) {
          body.tools = toolsList
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
              enableWebSearch,
              apiFormat: 'openai-response',
            })
          }
        }

        let totalContent = ''
        const webSearchResults: WebSearchResultItem[] = []

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
                const chunk = processResponseEvent(parsed, webSearchResults)
                if (chunk) {
                  if (chunk.content) {
                    totalContent += chunk.content
                  }
                  yield chunk
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

/**
 * 处理 Response API 流式事件
 */
function processResponseEvent(
  event: Record<string, unknown>,
  webSearchResults: WebSearchResultItem[]
): ChatStreamChunk | null {
  const eventType = event.type as string

  switch (eventType) {
    // 文本增量
    case 'response.output_text.delta': {
      const delta = event.delta as string
      if (delta) {
        return { content: delta, done: false }
      }
      break
    }

    // 推理/思考增量
    case 'response.reasoning_summary_text.delta': {
      const delta = event.delta as string
      if (delta) {
        return { content: '', thinking: delta, done: false }
      }
      break
    }

    // Function call 完成
    case 'response.function_call_arguments.done': {
      const callId = event.call_id as string
      const name = event.name as string
      const argumentsStr = event.arguments as string
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(argumentsStr || '{}')
      } catch {
        // 忽略解析错误
      }
      const toolUse: ToolUseRequest = {
        id: callId,
        name,
        input,
      }
      return { content: '', done: false, toolUse }
    }

    // Web Search 开始搜索
    case 'response.web_search_call.in_progress': {
      console.log('[OpenAI Response] Web Search 开始搜索')
      return { content: '', done: false, webSearch: { status: 'searching' } }
    }

    // Web Search 搜索完成
    case 'response.web_search_call.completed': {
      console.log('[OpenAI Response] Web Search 搜索完成')
      break
    }

    // 文本注解（包含搜索结果引用）
    case 'response.output_text.annotation.added': {
      const annotation = event.annotation as {
        type: string
        url?: string
        title?: string
      } | undefined

      if (annotation?.type === 'url_citation' && annotation.url) {
        webSearchResults.push({
          url: annotation.url,
          title: annotation.title || annotation.url,
        })
        console.log(`[OpenAI Response] 收到搜索引用: ${annotation.title}`)
      }
      break
    }

    // 输出项完成（可能包含完整的 annotations 或 function_call）
    case 'response.output_item.done': {
      const item = event.item as {
        type: string
        call_id?: string
        name?: string
        arguments?: string
        content?: Array<{
          type: string
          annotations?: Array<{
            type: string
            url?: string
            title?: string
          }>
        }>
      } | undefined

      // 处理 function_call 类型
      if (item?.type === 'function_call' && item.call_id && item.name) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(item.arguments || '{}')
        } catch {
          // 忽略解析错误
        }
        const toolUse: ToolUseRequest = {
          id: item.call_id,
          name: item.name,
          input,
        }
        return { content: '', done: false, toolUse }
      }

      if (item?.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.annotations) {
            for (const ann of content.annotations) {
              if (ann.type === 'url_citation' && ann.url) {
                // 避免重复添加
                if (!webSearchResults.some(r => r.url === ann.url)) {
                  webSearchResults.push({
                    url: ann.url,
                    title: ann.title || ann.url,
                  })
                }
              }
            }
          }
        }

        if (webSearchResults.length > 0) {
          console.log(`[OpenAI Response] 搜索结果汇总: ${webSearchResults.length} 条`)
          return { content: '', done: false, webSearch: { status: 'completed', results: [...webSearchResults] } }
        }
      }
      break
    }

    // 响应完成
    case 'response.completed':
    case 'response.done': {
      // 检查响应状态，如果是因为工具调用而停止
      const response = event.response as {
        status?: string
        output?: Array<{ type: string }>
      } | undefined
      if (response?.output?.some(o => o.type === 'function_call')) {
        return { content: '', done: false, stopReason: 'tool_use' }
      }
      // 最终检查是否有搜索结果需要发送
      if (webSearchResults.length > 0) {
        return { content: '', done: false, webSearch: { status: 'completed', results: [...webSearchResults] } }
      }
      break
    }
  }

  return null
}

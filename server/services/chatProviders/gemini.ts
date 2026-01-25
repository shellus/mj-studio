/**
 * Gemini API Provider
 *
 * 支持 Google Gemini 原生 API 的对话服务。
 * 端点: POST /v1beta/models/{model}:generateContent
 * 流式: POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk, ChatTool, ToolUseRequest } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { GEMINI_THINKING_BUDGET } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError, type ToolCallRecord } from '../../../app/shared/types'

// Gemini 消息内容类型
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: unknown } } }

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

// 将文件转换为 Gemini 多模态内容
function filesToGeminiParts(files: MessageFile[]): GeminiPart[] {
  const parts: GeminiPart[] = []

  for (const file of files) {
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const mimeType = match[1]
          const data = match[2]
          if (mimeType && data) {
            parts.push({
              inlineData: { mimeType, data },
            })
          }
        }
      }
    }
  }

  return parts
}

// 构建单条消息的 parts（支持多模态）
function buildGeminiParts(text: string, files?: MessageFile[] | null): GeminiPart[] {
  const parts: GeminiPart[] = []

  // Gemini 图片放在文本之前
  if (files && files.length > 0) {
    parts.push(...filesToGeminiParts(files))
  }

  if (text) {
    parts.push({ text })
  }

  return parts
}

export const geminiProvider: ChatProvider = {
  apiFormat: 'gemini',
  label: 'Gemini',

  createService(upstream: Upstream, keyName?: string): ChatService {
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, keyName)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    }

    function buildContents(
      historyMessages: Message[],
      userMessage?: string,
      userFiles?: MessageFile[]
    ): GeminiContent[] {
      const contents: GeminiContent[] = []

      for (let i = 0; i < historyMessages.length; i++) {
        const msg = historyMessages[i]
        if (!msg) continue

        if (msg.role === 'user') {
          contents.push({
            role: 'user',
            parts: buildGeminiParts(msg.content, msg.files),
          })
        } else if (msg.role === 'assistant') {
          // 检查是否有工具调用记录
          const toolCallRecords = msg.toolCalls || []

          if (toolCallRecords.length > 0) {
            const functionCallParts: GeminiPart[] = toolCallRecords.map(record => ({
              functionCall: {
                name: record.displayName || record.toolName,
                args: record.arguments,
              },
            }))
            // 如果有文本内容，添加到 parts 前面
            if (msg.content) {
              contents.push({
                role: 'model',
                parts: [{ text: msg.content }, ...functionCallParts],
              })
            } else {
              contents.push({
                role: 'model',
                parts: functionCallParts,
              })
            }

            // 为每个工具调用创建 functionResponse
            const functionResponseParts: GeminiPart[] = toolCallRecords.map(record => ({
              functionResponse: {
                name: record.displayName || record.toolName,
                response: {
                  content: record.response,
                },
              },
            }))

            if (functionResponseParts.length > 0) {
              contents.push({
                role: 'user',
                parts: functionResponseParts,
              })
            }
          } else {
            contents.push({
              role: 'model',
              parts: buildGeminiParts(msg.content, msg.files),
            })
          }
        }
      }

      // 如果有当前用户消息（首次请求时）
      if (userMessage) {
        contents.push({
          role: 'user',
          parts: buildGeminiParts(userMessage, userFiles),
        })
      }

      return contents
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
        const url = `${upstream.baseUrl}/v1beta/models/${modelName}:generateContent`
        const contents = buildContents(historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        if (logContext) {
          const ctx = { ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }
          const systemPromptSize = systemPrompt ? calcSize(systemPrompt) : 0
          const historySize = historyMessages.reduce((sum, m) => sum + calcSize(m.content), 0)
          const currentSize = calcSize(userMessage)

          if (logContext.type === '压缩') {
            logCompressRequest(ctx, historyMessages.length, historySize, systemPromptSize)
          } else {
            logRequest(ctx, { systemPromptSize, historyCount: historyMessages.length, historySize, currentSize, apiFormat: 'gemini' })
          }
        }

        const body: Record<string, unknown> = { contents }

        if (systemPrompt) {
          body.systemInstruction = { parts: [{ text: systemPrompt }] }
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
            const errorMsg = (errorData as { error?: { message?: string } }).error?.message
              || `HTTP ${response.status}: ${response.statusText}`
            if (logContext) {
              logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMsg)
            }
            return { success: false, error: errorMsg }
          }

          const data = await response.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          }
          const content = data.candidates?.[0]?.content?.parts
            ?.filter((p): p is { text: string } => 'text' in p)
            .map(p => p.text)
            .join('') || ''
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
        const url = `${upstream.baseUrl}/v1beta/models/${modelName}:streamGenerateContent?alt=sse`
        const contents = buildContents(historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        const body: Record<string, unknown> = { contents }

        if (systemPrompt) {
          body.systemInstruction = { parts: [{ text: systemPrompt }] }
        }

        // Gemini 原生思考功能参数
        if (enableThinking) {
          body.generationConfig = {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: GEMINI_THINKING_BUDGET,
            },
          }
        }

        // 工具定义
        const toolsList: unknown[] = []

        // Gemini Web Search 工具
        if (enableWebSearch) {
          toolsList.push({ googleSearch: {} })
        }

        // MCP 工具
        if (tools && tools.length > 0) {
          toolsList.push({
            functionDeclarations: tools.map(t => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            })),
          })
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
            logRequest(ctx, { systemPromptSize, historyCount: historyMessages.length, historySize, currentSize, enableThinking, enableWebSearch, apiFormat: 'gemini' })
          }
        }

        let totalContent = ''

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
              if (!data || data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data) as {
                  candidates?: Array<{
                    content?: {
                      parts?: Array<{
                        text?: string
                        thought?: boolean
                        functionCall?: { name: string; args: Record<string, unknown> }
                      }>
                    }
                    finishReason?: string
                    groundingMetadata?: {
                      groundingChunks?: Array<{
                        web?: { uri: string; title: string }
                      }>
                    }
                  }>
                }

                const candidate = parsed.candidates?.[0]

                // 处理 Gemini Web Search groundingMetadata
                const groundingChunks = candidate?.groundingMetadata?.groundingChunks
                if (groundingChunks && groundingChunks.length > 0) {
                  const results = groundingChunks
                    .filter(chunk => chunk.web)
                    .map(chunk => ({ url: chunk.web!.uri, title: chunk.web!.title }))
                  if (results.length > 0) {
                    console.log(`[Gemini] 收到搜索结果: ${results.length} 条`, results.map(r => r.title))
                    yield { content: '', done: false, webSearch: { status: 'completed', results } }
                  }
                }

                const parts = candidate?.content?.parts || []
                for (const part of parts) {
                  // 处理 functionCall
                  if (part.functionCall) {
                    const toolUse: ToolUseRequest = {
                      id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                      name: part.functionCall.name,
                      input: part.functionCall.args || {},
                    }
                    yield { content: '', done: false, toolUse }
                  }

                  if (!part.text) continue

                  // Gemini 原生思考格式：通过 thought 布尔字段判断
                  if (part.thought) {
                    yield { content: '', thinking: part.text, done: false }
                  } else {
                    totalContent += part.text
                    yield { content: part.text, done: false }
                  }
                }

                // 处理 finishReason
                const finishReason = candidate?.finishReason
                if (finishReason === 'TOOL_CALL' || finishReason === 'TOOL_USE') {
                  yield { content: '', done: false, stopReason: 'tool_use' }
                } else if (finishReason === 'STOP') {
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

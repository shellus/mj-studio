/**
 * Gemini API Provider
 *
 * 支持 Google Gemini 原生 API 的对话服务。
 * 端点: POST /v1beta/models/{model}:generateContent
 * 流式: POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { GEMINI_THINKING_BUDGET } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError } from '../../../app/shared/types'

// Gemini 消息内容类型
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

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
      userMessage: string,
      userFiles?: MessageFile[]
    ): GeminiContent[] {
      const contents: GeminiContent[] = []

      for (const msg of historyMessages) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: buildGeminiParts(msg.content, msg.files),
        })
      }

      contents.push({
        role: 'user',
        parts: buildGeminiParts(userMessage, userFiles),
      })

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
            logRequest(ctx, { systemPromptSize, historyCount: historyMessages.length, historySize, currentSize })
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
        userMessage: string,
        userFiles?: MessageFile[],
        signal?: AbortSignal,
        logContext?: LogContext,
        conversationId?: number,
        messageId?: number,
        enableThinking?: boolean
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
          const currentSize = calcSize(userMessage)

          if (logContext.type === '压缩') {
            logCompressRequest(ctx, historyMessages.length, historySize, systemPromptSize)
          } else {
            logRequest(ctx, { systemPromptSize, historyCount: historyMessages.length, historySize, currentSize })
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
                      parts?: Array<{ text?: string; thought?: boolean }>
                    }
                  }>
                }

                const parts = parsed.candidates?.[0]?.content?.parts || []
                for (const part of parts) {
                  if (!part.text) continue

                  // Gemini 原生思考格式：通过 thought 布尔字段判断
                  if (part.thought) {
                    yield { content: '', thinking: part.text, done: false }
                  } else {
                    totalContent += part.text
                    yield { content: part.text, done: false }
                  }
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

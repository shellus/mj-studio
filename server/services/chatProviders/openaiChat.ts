/**
 * OpenAI Chat API Provider
 *
 * 支持 OpenAI 及兼容 API 的对话服务。
 * 端点: POST /v1/chat/completions
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { OPENAI_REASONING_EFFORT } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError } from '../../../app/shared/types'

// OpenAI 多模态消息内容类型
type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ChatMessageContent[]
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
      userMessage: string,
      userFiles?: MessageFile[]
    ): ChatMessage[] {
      const messages: ChatMessage[] = []

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt })
      }

      for (const msg of historyMessages) {
        messages.push({
          role: msg.role,
          content: buildMessageContent(msg.content, msg.files),
        })
      }

      messages.push({
        role: 'user',
        content: buildMessageContent(userMessage, userFiles),
      })

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
              enableThinking,
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
        userMessage: string,
        userFiles?: MessageFile[],
        signal?: AbortSignal,
        logContext?: LogContext,
        conversationId?: number,
        messageId?: number,
        enableThinking?: boolean
      ): AsyncGenerator<ChatStreamChunk> {
        const url = `${upstream.baseUrl}/v1/chat/completions`
        const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        const body: Record<string, unknown> = {
          model: modelName,
          messages,
          stream: true,
        }

        if (enableThinking) {
          body.reasoning_effort = OPENAI_REASONING_EFFORT
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
            logRequest(ctx, {
              systemPromptSize,
              historyCount: historyMessages.length,
              historySize,
              currentSize,
              enableThinking,
              apiFormat: 'openai-chat',
            })
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
                const delta = parsed.choices?.[0]?.delta

                const reasoningContent = delta?.reasoning_content || ''
                if (reasoningContent) {
                  yield { content: '', thinking: reasoningContent, done: false }
                }

                const content = delta?.content || ''
                if (content) {
                  totalContent += content
                  yield { content, done: false }
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

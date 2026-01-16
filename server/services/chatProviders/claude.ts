/**
 * Claude API Provider
 *
 * 支持 Anthropic Claude 及兼容 API 的对话服务。
 * 端点: POST /v1/messages
 */

import type { Upstream, Message, MessageFile } from '../../database/schema'
import type { ChatProvider, ChatService, ChatResult, ChatStreamChunk } from './types'
import type { LogContext } from '../../utils/logger'
import { readFileAsBase64, isImageMimeType } from '../file'
import { useUpstreamService } from '../upstream'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../../utils/logger'
import { logConversationRequest, logConversationResponse } from '../../utils/httpLogger'
import { CLAUDE_THINKING_BUDGET_TOKENS } from '../../../app/shared/constants'
import { getErrorMessage, isAbortError } from '../../../app/shared/types'

// Claude 多模态消息内容类型
type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

// 将文件转换为 Claude 多模态内容
function filesToClaudeContent(files: MessageFile[]): ClaudeContentBlock[] {
  const contents: ClaudeContentBlock[] = []

  for (const file of files) {
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          const mediaType = match[1]
          const data = match[2]
          if (mediaType && data) {
            contents.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: data,
              },
            })
          }
        }
      }
    }
  }

  return contents
}

// 构建单条消息的 content（支持多模态）
function buildClaudeMessageContent(text: string, files?: MessageFile[] | null): string | ClaudeContentBlock[] {
  if (!files || files.length === 0) {
    return text
  }

  const contents: ClaudeContentBlock[] = []

  // Claude 要求图片在文本之前
  const fileContents = filesToClaudeContent(files)
  contents.push(...fileContents)

  if (text) {
    contents.push({ type: 'text', text })
  }

  if (contents.length === 1) {
    const firstContent = contents[0]
    if (firstContent?.type === 'text') {
      return text
    }
  }

  return contents
}

export const claudeProvider: ChatProvider = {
  apiFormat: 'claude',
  label: 'Claude',

  createService(upstream: Upstream, keyName?: string): ChatService {
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, keyName)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    }

    // 支持两种认证方式：x-api-key 或 Bearer token
    if (apiKey.startsWith('sk-ant-')) {
      headers['x-api-key'] = apiKey
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    function buildMessages(
      historyMessages: Message[],
      userMessage: string,
      userFiles?: MessageFile[]
    ): ClaudeMessage[] {
      const messages: ClaudeMessage[] = []

      for (const msg of historyMessages) {
        messages.push({
          role: msg.role,
          content: buildClaudeMessageContent(msg.content, msg.files),
        })
      }

      messages.push({
        role: 'user',
        content: buildClaudeMessageContent(userMessage, userFiles),
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
        const url = `${upstream.baseUrl}/v1/messages`
        const messages = buildMessages(historyMessages, userMessage, userFiles)
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
              apiFormat: 'claude',
            })
          }
        }

        const body: Record<string, unknown> = {
          model: modelName,
          messages,
          max_tokens: 8192,
        }

        if (systemPrompt) {
          body.system = systemPrompt
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
          const content = data.content
            ?.filter((block: { type: string; text?: string }) => block.type === 'text')
            .map((block: { type: string; text?: string }) => block.text)
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
        enableThinking?: boolean,
        enableWebSearch?: boolean
      ): AsyncGenerator<ChatStreamChunk> {
        const url = `${upstream.baseUrl}/v1/messages`
        const messages = buildMessages(historyMessages, userMessage, userFiles)
        const startTime = Date.now()

        const body: Record<string, unknown> = {
          model: modelName,
          messages,
          max_tokens: 8192,
          stream: true,
        }

        if (systemPrompt) {
          body.system = systemPrompt
        }

        // Claude 原生思考功能参数
        if (enableThinking) {
          body.thinking = {
            type: 'enabled',
            budget_tokens: CLAUDE_THINKING_BUDGET_TOKENS,
          }
        }

        // Claude Web Search 工具
        if (enableWebSearch) {
          body.tools = [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
            },
          ]
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
              enableWebSearch: _enableWebSearch,
              apiFormat: 'claude',
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
              if (!data || data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)

                // 处理 Web Search 事件
                if (parsed.type === 'content_block_start') {
                  const block = parsed.content_block
                  // 搜索开始
                  if (block?.type === 'server_tool_use' && block?.name === 'web_search') {
                    yield { content: '', done: false, webSearch: { status: 'searching' } }
                  }
                  // 搜索结果
                  if (block?.type === 'web_search_tool_result') {
                    const results = (block.content || [])
                      .filter((item: { type: string }) => item.type === 'web_search_result')
                      .map((item: { url: string; title: string; page_age?: string }) => ({
                        url: item.url,
                        title: item.title,
                        pageAge: item.page_age,
                      }))
                    console.log(`[Claude] 收到搜索结果: ${results.length} 条`, results.map(r => r.title))
                    yield { content: '', done: false, webSearch: { status: 'completed', results } }
                  }
                }

                if (parsed.type === 'content_block_delta') {
                  const delta = parsed.delta
                  // 处理思考内容（Claude 原生 thinking_delta）
                  if (delta?.type === 'thinking_delta' && delta.thinking) {
                    yield { content: '', thinking: delta.thinking, done: false }
                  }

                  // 处理文本内容（Claude 原生 text_delta）
                  if (delta?.type === 'text_delta' && delta.text) {
                    totalContent += delta.text
                    yield { content: delta.text, done: false }
                  }

                  // 兼容旧格式：直接在 delta 中的 text 字段
                  if (!delta?.type && delta?.text) {
                    totalContent += delta.text
                    yield { content: delta.text, done: false }
                  }
                } else if (parsed.type === 'message_stop') {
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

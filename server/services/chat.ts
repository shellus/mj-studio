// 对话服务层（流式响应）
import type { Upstream, Message, MessageFile } from '../database/schema'
import { readFileAsBase64, isImageMimeType } from './file'
import { useUpstreamService } from './upstream'
import type { LogContext } from '../utils/logger'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../utils/logger'
import { logConversationRequest, logConversationResponse } from '../utils/httpLogger'
import { OPENAI_REASONING_EFFORT } from '../../app/shared/constants'
import { getErrorMessage, isAbortError } from '../../app/shared/types'

// OpenAI 多模态消息内容类型
type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ChatMessageContent[]
}

export interface ChatStreamChunk {
  content: string
  thinking?: string  // 思考/推理内容
  done: boolean
}

// 将文件转换为多模态消息内容
function filesToContent(files: MessageFile[]): ChatMessageContent[] {
  const contents: ChatMessageContent[] = []

  for (const file of files) {
    // 只有图片类型才能作为多模态输入
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        contents.push({
          type: 'image_url',
          image_url: { url: base64, detail: 'auto' },
        })
      }
    }
    // 非图片文件暂时跳过（未来可扩展支持 PDF 等）
  }

  return contents
}

// 构建单条消息的 content（支持多模态）
function buildMessageContent(text: string, files?: MessageFile[] | null): string | ChatMessageContent[] {
  // 没有文件，返回纯文本
  if (!files || files.length === 0) {
    return text
  }

  // 有文件，构建多模态内容
  const contents: ChatMessageContent[] = []

  // 先添加文本
  if (text) {
    contents.push({ type: 'text', text })
  }

  // 添加文件内容
  const fileContents = filesToContent(files)
  contents.push(...fileContents)

  // 如果只有文本没有有效的文件内容，返回纯文本
  const firstContent = contents[0]
  if (contents.length === 1 && firstContent?.type === 'text') {
    return text
  }

  return contents
}

// 创建对话服务实例
export function createChatService(upstream: Upstream, keyName?: string) {
  const upstreamService = useUpstreamService()
  const apiKey = upstreamService.getApiKey(upstream, keyName)

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 构建消息列表（包含系统提示词和历史消息，支持多模态）
  function buildMessages(
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = []

    // 添加系统提示词
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    // 添加历史消息（包含文件）
    for (const msg of historyMessages) {
      messages.push({
        role: msg.role,
        content: buildMessageContent(msg.content, msg.files),
      })
    }

    // 添加当前用户消息（包含文件）
    messages.push({
      role: 'user',
      content: buildMessageContent(userMessage, userFiles),
    })

    return messages
  }

  // 非流式对话
  async function chat(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext
  ): Promise<{ success: boolean, content?: string, error?: string }> {
    const url = `${upstream.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
    const startTime = Date.now()

    // 记录请求日志
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
        return {
          success: false,
          error: errorMsg,
        }
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      const durationMs = Date.now() - startTime

      // 记录响应日志
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
  }

  // 流式对话 - 返回 AsyncGenerator
  async function* chatStream(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext,
    conversationId?: number,
    messageId?: number,
    enableThinking?: boolean  // 启用思考/推理功能
  ): AsyncGenerator<ChatStreamChunk> {
    const url = `${upstream.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
    const startTime = Date.now()

    const body: Record<string, unknown> = {
      model: modelName,
      messages,
      stream: true,
    }

    // 启用思考功能时添加 reasoning_effort 参数
    if (enableThinking) {
      body.reasoning_effort = OPENAI_REASONING_EFFORT
    }

    // 记录 HTTP 请求日志
    if (conversationId !== undefined && messageId !== undefined) {
      logConversationRequest(conversationId, messageId, {
        url,
        method: 'POST',
        headers,
        body,
      })
    }

    // 记录控制台请求日志
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
        })
      }
    }

    let totalContent = ''
    let totalThinking = ''  // 思考/推理内容

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
          errorMessage = errorBody.error?.message || errorMessage
        } catch {
          errorBody = errorText
        }

        // 记录 HTTP 响应日志（HTTP 错误）
        if (conversationId !== undefined && messageId !== undefined) {
          logConversationResponse(conversationId, messageId, {
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
            durationMs: Date.now() - startTime,
          })
        }

        // 记录控制台错误日志
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

        // 处理 SSE 格式的数据
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            const durationMs = Date.now() - startTime

            // 记录 HTTP 响应日志（成功）
            if (conversationId !== undefined && messageId !== undefined) {
              logConversationResponse(conversationId, messageId, {
                status: 200,
                content: totalContent,
                durationMs,
              })
            }

            // 记录控制台完成日志
            if (logContext) {
              logComplete({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, calcSize(totalContent), durationMs)
            }
            yield { content: '', done: true }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta

            // 解析思考/推理内容（OpenAI 格式使用 reasoning_content 字段）
            const reasoningContent = delta?.reasoning_content || ''
            if (reasoningContent) {
              totalThinking += reasoningContent
              yield { content: '', thinking: reasoningContent, done: false }
            }

            // 解析正式回复内容
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

      // 记录 HTTP 响应日志（成功）
      if (conversationId !== undefined && messageId !== undefined) {
        logConversationResponse(conversationId, messageId, {
          status: 200,
          content: totalContent,
          durationMs,
        })
      }

      // 记录控制台完成日志
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

      // 记录 HTTP 响应日志（网络错误）
      if (conversationId !== undefined && messageId !== undefined) {
        logConversationResponse(conversationId, messageId, {
          status: null,
          error: errorMsg,
          errorType: error instanceof Error ? error.name : 'Error',
          durationMs,
        })
      }

      // 记录控制台错误日志
      if (logContext) {
        logError({ ...logContext, configName: upstream.name, baseUrl: upstream.baseUrl, modelName }, errorMsg)
      }
      throw error
    }
  }

  return {
    chat,
    chatStream,
    buildMessages,
  }
}

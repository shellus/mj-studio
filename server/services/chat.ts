// 对话服务层（流式响应）
import type { ModelConfig, Message } from '../database/schema'
import type { LogContext } from '../utils/logger'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../utils/logger'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatStreamChunk {
  content: string
  done: boolean
}

// 创建对话服务实例
export function createChatService(config: ModelConfig) {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }

  // 构建消息列表（包含系统提示词和历史消息）
  function buildMessages(systemPrompt: string | null, historyMessages: Message[], userMessage: string): ChatMessage[] {
    const messages: ChatMessage[] = []

    // 添加系统提示词
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    // 添加历史消息
    for (const msg of historyMessages) {
      messages.push({ role: msg.role, content: msg.content })
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage })

    return messages
  }

  // 非流式对话
  async function chat(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    signal?: AbortSignal,
    logContext?: LogContext
  ): Promise<{ success: boolean, content?: string, error?: string }> {
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage)
    const startTime = Date.now()

    // 记录请求日志
    if (logContext) {
      const ctx = { ...logContext, baseUrl: config.baseUrl, modelName }
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
          logError({ ...logContext, baseUrl: config.baseUrl, modelName }, errorMsg)
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
        logResponse({ ...logContext, baseUrl: config.baseUrl, modelName }, calcSize(content), durationMs)
      }

      return { success: true, content }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: '请求已取消' }
      }
      if (logContext) {
        logError({ ...logContext, baseUrl: config.baseUrl, modelName }, error.message || '请求失败')
      }
      return { success: false, error: error.message || '请求失败' }
    }
  }

  // 流式对话 - 返回 AsyncGenerator
  async function* chatStream(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    signal?: AbortSignal,
    logContext?: LogContext
  ): AsyncGenerator<ChatStreamChunk> {
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage)
    const startTime = Date.now()

    // 记录请求日志
    if (logContext) {
      const ctx = { ...logContext, baseUrl: config.baseUrl, modelName }
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
      stream: true,
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
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorMessage
        } catch {}
        if (logContext) {
          logError({ ...logContext, baseUrl: config.baseUrl, modelName }, errorMessage)
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
            // 记录完成日志
            if (logContext) {
              const durationMs = Date.now() - startTime
              logComplete({ ...logContext, baseUrl: config.baseUrl, modelName }, calcSize(totalContent), durationMs)
            }
            yield { content: '', done: true }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              totalContent += content
              yield { content, done: false }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 记录完成日志
      if (logContext) {
        const durationMs = Date.now() - startTime
        logComplete({ ...logContext, baseUrl: config.baseUrl, modelName }, calcSize(totalContent), durationMs)
      }
      yield { content: '', done: true }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield { content: '', done: true }
        return
      }
      if (logContext) {
        logError({ ...logContext, baseUrl: config.baseUrl, modelName }, error.message || '请求失败')
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

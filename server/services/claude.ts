// Claude API 对话服务层（流式响应）
import type { ModelConfig, Message, MessageFile } from '../database/schema'
import { readFileAsBase64, isImageMimeType } from './file'
import type { LogContext } from '../utils/logger'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../utils/logger'

// Claude 多模态消息内容类型
type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

interface ChatStreamChunk {
  content: string
  done: boolean
}

// 将文件转换为 Claude 多模态内容
function filesToClaudeContent(files: MessageFile[]): ClaudeContentBlock[] {
  const contents: ClaudeContentBlock[] = []

  for (const file of files) {
    if (isImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        // 从 data URL 中提取纯 base64 数据
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          contents.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
          })
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

  if (contents.length === 1 && contents[0].type === 'text') {
    return text
  }

  return contents
}

// 创建 Claude 对话服务实例
export function createClaudeChatService(config: ModelConfig) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  // 支持两种认证方式：x-api-key 或 Bearer token
  if (config.apiKey.startsWith('sk-ant-')) {
    headers['x-api-key'] = config.apiKey
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  // 构建消息列表（不包含 system，Claude 的 system 是独立字段）
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

  // 非流式对话
  async function chat(
    modelName: string,
    systemPrompt: string | null,
    historyMessages: Message[],
    userMessage: string,
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    const url = `${config.baseUrl}/v1/messages`
    const messages = buildMessages(historyMessages, userMessage, userFiles)
    const startTime = Date.now()

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
          logError({ ...logContext, baseUrl: config.baseUrl, modelName }, errorMsg)
        }
        return { success: false, error: errorMsg }
      }

      const data = await response.json()
      // Claude 响应格式：content 是数组，提取所有 text 类型的内容
      const content = data.content
        ?.filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('') || ''
      const durationMs = Date.now() - startTime

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
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext
  ): AsyncGenerator<ChatStreamChunk> {
    const url = `${config.baseUrl}/v1/messages`
    const messages = buildMessages(historyMessages, userMessage, userFiles)
    const startTime = Date.now()

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

    const body: Record<string, unknown> = {
      model: modelName,
      messages,
      max_tokens: 8192,
      stream: true,
    }

    if (systemPrompt) {
      body.system = systemPrompt
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

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)

            // Claude 流式事件类型
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text || ''
              if (text) {
                totalContent += text
                yield { content: text, done: false }
              }
            } else if (parsed.type === 'message_stop') {
              if (logContext) {
                const durationMs = Date.now() - startTime
                logComplete({ ...logContext, baseUrl: config.baseUrl, modelName }, calcSize(totalContent), durationMs)
              }
              yield { content: '', done: true }
              return
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

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

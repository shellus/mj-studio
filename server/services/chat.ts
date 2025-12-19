// 对话服务层（流式响应）
import type { ModelConfig, Message, MessageFile } from '../database/schema'
import { startStreamingSession, appendStreamingContent, endStreamingSession } from './streamingCache'
import { readFileAsBase64, isImageMimeType } from './file'
import type { LogContext } from '../utils/logger'
import { calcSize, logRequest, logCompressRequest, logComplete, logResponse, logError } from '../utils/logger'

// OpenAI 多模态消息内容类型
type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ChatMessageContent[]
}

interface ChatStreamChunk {
  content: string
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
  if (contents.length === 1 && contents[0].type === 'text') {
    return text
  }

  return contents
}

// 创建对话服务实例
export function createChatService(config: ModelConfig) {
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
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
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
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
    userFiles?: MessageFile[],
    signal?: AbortSignal,
    logContext?: LogContext
  ): AsyncGenerator<ChatStreamChunk> {
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage, userFiles)
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

// 工具函数：将流式响应写入 H3 事件（带缓存）
export async function writeStreamToResponse(
  event: any,
  stream: AsyncGenerator<ChatStreamChunk>,
  conversationId?: number,
  userId?: number
): Promise<string> {
  let fullContent = ''
  let streamCompleted = false

  // 开始缓存会话
  if (conversationId && userId) {
    startStreamingSession(conversationId, userId)
  }

  try {
    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content
        // 缓存内容
        if (conversationId && userId) {
          appendStreamingContent(conversationId, userId, chunk.content)
        }
        // 写入 SSE 格式数据
        const data = JSON.stringify({ content: chunk.content, done: false })
        await event.node.res.write(`data: ${data}\n\n`)
      }
      if (chunk.done) {
        streamCompleted = true
        const data = JSON.stringify({ content: '', done: true })
        await event.node.res.write(`data: ${data}\n\n`)
      }
    }
    streamCompleted = true
  } finally {
    // 只有流式成功完成后才清除缓存，否则保留缓存供客户端恢复
    if (streamCompleted && conversationId && userId) {
      endStreamingSession(conversationId, userId)
    }
  }

  return fullContent
}

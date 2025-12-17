// 对话服务层（流式响应）
import type { ModelConfig, Message } from '../database/schema'

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
    signal?: AbortSignal
  ): Promise<{ success: boolean, content?: string, error?: string }> {
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage)

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
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''

      return { success: true, content }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: '请求已取消' }
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
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    const url = `${config.baseUrl}/v1/chat/completions`
    const messages = buildMessages(systemPrompt, historyMessages, userMessage)

    const body = {
      model: modelName,
      messages,
      stream: true,
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
        yield { content: '', done: true }
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
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
            yield { content: '', done: true }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              yield { content, done: false }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      yield { content: '', done: true }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield { content: '', done: true }
        return
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

// 工具函数：将流式响应写入 H3 事件
export async function writeStreamToResponse(
  event: any,
  stream: AsyncGenerator<ChatStreamChunk>
): Promise<string> {
  let fullContent = ''

  for await (const chunk of stream) {
    if (chunk.content) {
      fullContent += chunk.content
      // 写入 SSE 格式数据
      const data = JSON.stringify({ content: chunk.content, done: false })
      await event.node.res.write(`data: ${data}\n\n`)
    }
    if (chunk.done) {
      const data = JSON.stringify({ content: '', done: true })
      await event.node.res.write(`data: ${data}\n\n`)
    }
  }

  return fullContent
}

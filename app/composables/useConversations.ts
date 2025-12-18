// 对话状态管理
import type { MessageMark } from '~/shared/types'

export interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  modelConfigId: number | null
  modelName: string | null
  createdAt: string
  mark?: MessageMark | null
}

export interface Conversation {
  id: number
  userId: number
  assistantId: number
  title: string
  createdAt: string
  updatedAt: string
}

export function useConversations() {
  const conversations = useState<Conversation[]>('conversations', () => [])
  const messages = useState<Message[]>('messages', () => [])
  const isLoading = useState('conversations-loading', () => false)
  const currentConversationId = useState<number | null>('currentConversationId', () => null)
  const isStreaming = useState('chat-streaming', () => false)
  const streamingContent = useState('chat-streaming-content', () => '')

  // 打字机效果相关状态
  let contentBuffer = '' // 待渲染的内容缓冲
  let displayedContent = '' // 已显示的内容
  let typingTimer: ReturnType<typeof setTimeout> | null = null
  const TYPING_SPEED = 15 // 每个字符的渲染间隔(ms)
  let streamingMessageIndex = -1 // 正在流式输出的消息索引（-1 表示最后一条）

  // 用于停止流式输出的 AbortController
  let currentAbortController: AbortController | null = null

  // 获取正在流式输出的消息
  function getStreamingMessage() {
    if (streamingMessageIndex >= 0 && streamingMessageIndex < messages.value.length) {
      return messages.value[streamingMessageIndex]
    }
    return messages.value[messages.value.length - 1]
  }

  // 打字机效果：逐字渲染缓冲区内容
  function startTyping() {
    if (typingTimer) return // 已经在运行

    function tick() {
      if (displayedContent.length < contentBuffer.length) {
        // 每次渲染多个字符以加快速度
        const charsToAdd = Math.min(3, contentBuffer.length - displayedContent.length)
        displayedContent = contentBuffer.slice(0, displayedContent.length + charsToAdd)
        streamingContent.value = displayedContent

        // 更新消息列表中的内容
        const targetMessage = getStreamingMessage()
        if (targetMessage?.role === 'assistant') {
          targetMessage.content = displayedContent
        }

        typingTimer = setTimeout(tick, TYPING_SPEED)
      } else {
        typingTimer = null
      }
    }

    tick()
  }

  // 停止打字机效果，立即显示所有内容
  function flushTyping() {
    if (typingTimer) {
      clearTimeout(typingTimer)
      typingTimer = null
    }
    displayedContent = contentBuffer
    streamingContent.value = displayedContent

    const targetMessage = getStreamingMessage()
    // 错误消息不覆盖
    if (targetMessage?.role === 'assistant' && targetMessage.mark !== 'error') {
      targetMessage.content = displayedContent
    }
  }

  // 当前选中的对话
  const currentConversation = computed(() => {
    if (currentConversationId.value) {
      return conversations.value.find(c => c.id === currentConversationId.value)
    }
    return null
  })

  // 加载对话列表
  async function loadConversations(assistantId: number) {
    isLoading.value = true
    try {
      const result = await $fetch<Conversation[]>('/api/conversations', {
        query: { assistantId },
      })
      conversations.value = result
      // 清空当前对话选择
      currentConversationId.value = null
      messages.value = []
    } catch (error) {
      console.error('加载对话列表失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 选择对话并加载消息
  async function selectConversation(id: number) {
    currentConversationId.value = id
    try {
      const result = await $fetch<{ conversation: Conversation, messages: Message[] }>(`/api/conversations/${id}`)
      messages.value = result.messages

      // 检查是否有进行中的流式内容
      const streamingData = await $fetch<{ streaming: boolean, content: string }>(`/api/conversations/${id}/streaming`)
      if (streamingData.streaming && streamingData.content) {
        // 恢复流式状态
        isStreaming.value = true
        contentBuffer = streamingData.content
        displayedContent = ''
        streamingContent.value = ''

        // 添加临时的助手消息占位
        const tempAssistantMessage: Message = {
          id: Date.now(),
          conversationId: id,
          role: 'assistant',
          content: '',
          modelConfigId: null,
          modelName: null,
          createdAt: new Date().toISOString(),
        }
        messages.value.push(tempAssistantMessage)

        // 开始打字机效果
        startTyping()
      }
    } catch (error) {
      console.error('加载对话详情失败:', error)
      messages.value = []
    }
  }

  // 创建对话
  async function createConversation(assistantId: number, title?: string) {
    const conversation = await $fetch<Conversation>('/api/conversations', {
      method: 'POST',
      body: { assistantId, title },
    })
    conversations.value.unshift(conversation)
    currentConversationId.value = conversation.id
    messages.value = []
    return conversation
  }

  // 更新对话标题
  async function updateConversationTitle(id: number, title: string) {
    const updated = await $fetch<Conversation>(`/api/conversations/${id}`, {
      method: 'PUT',
      body: { title },
    })
    const index = conversations.value.findIndex(c => c.id === id)
    if (index >= 0) {
      conversations.value[index] = updated
    }
    return updated
  }

  // 删除对话
  async function deleteConversation(id: number) {
    await $fetch(`/api/conversations/${id}`, {
      method: 'DELETE',
    })
    conversations.value = conversations.value.filter(c => c.id !== id)

    // 如果删除的是当前选中的对话，清空选择
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
    }
  }

  // 发送消息（流式）
  async function sendMessage(conversationId: number, content: string, modelName?: string | null) {
    isStreaming.value = true
    streamingContent.value = ''
    contentBuffer = ''
    displayedContent = ''

    // 创建 AbortController 用于停止
    const abortController = new AbortController()
    currentAbortController = abortController

    // 先添加用户消息到本地
    const tempUserMessage: Message = {
      id: Date.now(),
      conversationId,
      role: 'user',
      content,
      modelConfigId: null,
      modelName: null,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(tempUserMessage)

    // 添加临时的助手消息占位
    const tempAssistantMessage: Message = {
      id: Date.now() + 1,
      conversationId,
      role: 'assistant',
      content: '',
      modelConfigId: null,
      modelName: modelName || null,
      createdAt: new Date().toISOString(),
      mark: null,
    }
    messages.value.push(tempAssistantMessage)

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, stream: true }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '发送失败')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let buffer = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 处理 SSE 格式
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              throw new Error(parsed.error)
            }
            // 处理完成信号
            if (parsed.done) {
              streamDone = true
              break
            }
            if (parsed.content) {
              // 追加到缓冲区，打字机效果会逐字渲染
              contentBuffer += parsed.content
              startTyping()
            }
          } catch (e: any) {
            // 如果是应用错误（非 JSON 解析错误），重新抛出
            if (e.message && !e.message.includes('JSON')) {
              throw e
            }
            // JSON 解析错误则忽略
          }
        }
      }

      // 更新对话列表中的更新时间
      const conversation = conversations.value.find(c => c.id === conversationId)
      if (conversation) {
        conversation.updatedAt = new Date().toISOString()
        // 如果是新对话的第一条消息，更新标题
        if (messages.value.length === 2) {
          conversation.title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
        }
      }
    } catch (error: any) {
      // 如果是用户主动停止，不显示错误
      if (error.name === 'AbortError') {
        // 保留已输出的内容
        flushTyping()
        return
      }
      // 停止打字机效果
      flushTyping()
      // 将错误显示在助手消息中
      const lastIndex = messages.value.length - 1
      const lastMessage = messages.value[lastIndex]
      if (lastMessage?.role === 'assistant') {
        // 替换整个对象以确保 Vue 响应式更新
        messages.value[lastIndex] = {
          ...lastMessage,
          content: error.message || '发送失败',
          mark: 'error',
        }
      }
      // 不抛出错误，让错误显示在对话中
    } finally {
      // 确保所有内容都显示完毕
      flushTyping()
      isStreaming.value = false
      streamingContent.value = ''
      contentBuffer = ''
      displayedContent = ''
      currentAbortController = null
    }
  }

  // 删除消息
  async function deleteMessage(id: number) {
    await $fetch(`/api/messages/${id}`, {
      method: 'DELETE',
    })
    messages.value = messages.value.filter(m => m.id !== id)
  }

  // 重放消息（让 AI 重新回复）
  async function replayMessage(message: Message) {
    isStreaming.value = true
    streamingContent.value = ''
    contentBuffer = ''
    displayedContent = ''

    // 如果是 AI 消息，先从本地移除
    if (message.role === 'assistant') {
      messages.value = messages.value.filter(m => m.id !== message.id)
    }

    // 添加临时的助手消息占位
    const tempAssistantMessage: Message = {
      id: Date.now(),
      conversationId: message.conversationId,
      role: 'assistant',
      content: '',
      modelConfigId: null,
      modelName: null,
      createdAt: new Date().toISOString(),
      mark: null,
    }
    messages.value.push(tempAssistantMessage)

    try {
      const response = await fetch(`/api/messages/${message.id}/replay`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '重放失败')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let buffer = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              throw new Error(parsed.error)
            }
            if (parsed.done) {
              streamDone = true
              break
            }
            if (parsed.content) {
              contentBuffer += parsed.content
              startTyping()
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e
            }
          }
        }
      }

      // 流结束，等待打字机效果完成
      await flushTyping()

      // 刷新消息列表
      if (currentConversationId.value) {
        const data = await $fetch(`/api/conversations/${currentConversationId.value}`)
        messages.value = data.messages
      }
    } catch (error: any) {
      // 显示错误
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = error.message || '重放失败'
        lastMsg.mark = 'error'
      }
      flushTyping()
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
      contentBuffer = ''
      displayedContent = ''
    }
  }

  // 清理状态
  function cleanup() {
    flushTyping()
    conversations.value = []
    messages.value = []
    currentConversationId.value = null
    isStreaming.value = false
    streamingContent.value = ''
    contentBuffer = ''
    displayedContent = ''
  }

  // 手动添加消息（不触发AI回复）
  async function addManualMessage(conversationId: number, content: string, role: 'user' | 'assistant') {
    const message = await $fetch<Message>(`/api/conversations/${conversationId}/messages-manual`, {
      method: 'POST',
      body: { content, role },
    })
    messages.value.push(message)

    // 更新对话列表中的更新时间
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (conversation) {
      conversation.updatedAt = new Date().toISOString()
    }

    return message
  }

  // 停止流式输出
  function stopStreaming() {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    // 立即结束打字机效果，保留已输出的内容
    flushTyping()
    isStreaming.value = false
  }

  // 压缩对话
  async function compressConversation(conversationId: number, modelName?: string | null, onStart?: () => void) {
    // 1. 调用压缩 API 创建压缩请求消息
    const result = await $fetch<{
      success: boolean
      compressRequest: Message
      stats: { messagesToCompressCount: number; keepMessagesCount: number }
    }>(`/api/conversations/${conversationId}/compress`, {
      method: 'POST',
    })

    // 2. 刷新消息列表（显示压缩请求和重排后的消息）
    const data = await $fetch<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${conversationId}`)
    messages.value = data.messages

    // 触发开始回调（此时压缩请求已在列表中）
    onStart?.()

    // 3. 发送压缩请求触发 AI 生成摘要
    isStreaming.value = true
    streamingContent.value = ''
    contentBuffer = ''
    displayedContent = ''

    // 创建 AbortController 用于停止
    const abortController = new AbortController()
    currentAbortController = abortController

    // 找到压缩请求消息的位置，在其后插入临时的压缩响应
    const compressRequestIndex = messages.value.findIndex(m => m.mark === 'compress-request')
    const tempAssistantMessage: Message = {
      id: Date.now(),
      conversationId,
      role: 'assistant',
      content: '',
      modelConfigId: null,
      modelName: modelName || null,
      createdAt: new Date().toISOString(),
      mark: 'compress-response',
    }
    // 插入到压缩请求之后，并记录索引
    if (compressRequestIndex >= 0) {
      messages.value.splice(compressRequestIndex + 1, 0, tempAssistantMessage)
      streamingMessageIndex = compressRequestIndex + 1
    } else {
      messages.value.push(tempAssistantMessage)
      streamingMessageIndex = messages.value.length - 1
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: result.compressRequest.content,
          stream: true,
          isCompressRequest: true,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '压缩失败')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let buffer = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              throw new Error(parsed.error)
            }
            if (parsed.done) {
              streamDone = true
              break
            }
            if (parsed.content) {
              contentBuffer += parsed.content
              startTyping()
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e
            }
          }
        }
      }

      // 刷新消息列表获取最终状态
      flushTyping()
      const finalData = await $fetch<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${conversationId}`)
      messages.value = finalData.messages

      return result.stats
    } catch (error: any) {
      if (error.name === 'AbortError') {
        flushTyping()
        return
      }
      flushTyping()
      // 更新正在流式输出的消息为错误状态
      const targetMessage = getStreamingMessage()
      if (targetMessage?.role === 'assistant') {
        const targetIndex = streamingMessageIndex >= 0 ? streamingMessageIndex : messages.value.length - 1
        messages.value[targetIndex] = {
          ...targetMessage,
          content: error.message || '压缩失败',
          mark: 'error',
        }
      }
      throw error
    } finally {
      flushTyping()
      isStreaming.value = false
      streamingContent.value = ''
      contentBuffer = ''
      displayedContent = ''
      currentAbortController = null
      streamingMessageIndex = -1
    }
  }

  return {
    conversations,
    messages,
    isLoading,
    currentConversationId,
    currentConversation,
    isStreaming,
    streamingContent,
    loadConversations,
    selectConversation,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    sendMessage,
    deleteMessage,
    replayMessage,
    cleanup,
    addManualMessage,
    stopStreaming,
    compressConversation,
  }
}

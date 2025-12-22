// 对话状态管理
// 适配流式输出系统规范：消息 ID 提前生成、SSE 独立订阅、后端独立状态机
import type { MessageMark, MessageStatus, MessageFile } from '~/shared/types'
import { useAuth } from './useAuth'

export interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  files?: MessageFile[] | null
  modelConfigId: number | null
  modelName: string | null
  createdAt: string
  mark?: MessageMark | null
  status?: MessageStatus | null  // AI 消息状态
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
  const { getAuthHeader } = useAuth()
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
  let streamingMessageId = -1 // 正在流式输出的消息 ID

  // 当前的 SSE 连接（用于停止时清理）
  let currentEventSource: { abort: () => void } | null = null

  // 获取正在流式输出的消息
  function getStreamingMessage(): Message | undefined {
    return messages.value.find(m => m.id === streamingMessageId)
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

      // 检查是否有正在生成的消息（status 为 created/pending/streaming）
      const streamingMsg = result.messages.find(m =>
        m.role === 'assistant' &&
        (m.status === 'created' || m.status === 'pending' || m.status === 'streaming')
      )

      if (streamingMsg) {
        // 恢复流式状态：订阅该消息的 SSE
        subscribeToStream(streamingMsg.id)
      }
    } catch (error) {
      console.error('加载对话详情失败:', error)
      messages.value = []
    }
  }

  // 订阅消息的 SSE 流
  function subscribeToStream(messageId: number) {
    isStreaming.value = true
    streamingMessageId = messageId
    contentBuffer = ''
    displayedContent = ''
    streamingContent.value = ''

    // 创建 AbortController 用于取消
    const abortController = new AbortController()
    currentEventSource = { abort: () => abortController.abort() }

    // 使用 fetch 订阅 SSE（需要手动添加 JWT 认证头）
    fetch(`/api/messages/${messageId}/stream`, {
      signal: abortController.signal,
      headers: getAuthHeader(),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('订阅失败')
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
                // 错误处理
                const targetMessage = getStreamingMessage()
                if (targetMessage) {
                  targetMessage.content = parsed.error
                  targetMessage.mark = 'error'
                  targetMessage.status = 'failed'
                }
                streamDone = true
                break
              }

              if (parsed.done) {
                // 流结束：更新消息状态
                const targetMessage = getStreamingMessage()
                if (targetMessage) {
                  targetMessage.status = parsed.status || 'completed'
                }
                flushTyping()
                streamDone = true
                break
              }

              if (parsed.content) {
                // 追加到缓冲区，打字机效果会逐字渲染
                contentBuffer += parsed.content
                startTyping()
              }
            } catch {
              // JSON 解析错误则忽略
            }
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          // 用户主动停止，保留已输出内容
          flushTyping()
          return
        }
        console.error('SSE 订阅错误:', error)
        // 显示错误
        const targetMessage = getStreamingMessage()
        if (targetMessage) {
          targetMessage.content = error.message || '连接失败'
          targetMessage.mark = 'error'
          targetMessage.status = 'failed'
        }
        flushTyping()
      })
      .finally(() => {
        flushTyping()
        isStreaming.value = false
        streamingContent.value = ''
        contentBuffer = ''
        displayedContent = ''
        currentEventSource = null
        streamingMessageId = -1
      })
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

  // 开始新对话（虚拟状态，发送消息时才创建）
  function startNewConversation() {
    currentConversationId.value = null
    messages.value = []
  }

  // 发送消息（流式）
  async function sendMessage(conversationId: number, content: string, files?: MessageFile[], modelName?: string | null) {
    // 创建临时用户消息显示
    const tempUserMessage: Message = {
      id: Date.now(),
      conversationId,
      role: 'user',
      content,
      files: files || null,
      modelConfigId: null,
      modelName: null,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(tempUserMessage)

    try {
      // 发送 POST 请求创建消息
      const result = await $fetch<{ userMessageId: number | null; assistantMessageId: number }>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { content, files },
      })

      // 更新用户消息的真实 ID
      if (result.userMessageId) {
        const userMsgIndex = messages.value.findIndex(m => m.id === tempUserMessage.id)
        if (userMsgIndex >= 0) {
          const userMsg = messages.value[userMsgIndex]
          if (userMsg) {
            userMsg.id = result.userMessageId
          }
        }
      }

      // 添加 AI 消息占位符（status: created）
      const assistantMessage: Message = {
        id: result.assistantMessageId,
        conversationId,
        role: 'assistant',
        content: '',
        modelConfigId: null,
        modelName: modelName || null,
        createdAt: new Date().toISOString(),
        status: 'created',
      }
      messages.value.push(assistantMessage)

      // 订阅 SSE 流
      subscribeToStream(result.assistantMessageId)

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
      // 发送失败，显示错误
      const errorMessage: Message = {
        id: Date.now() + 1,
        conversationId,
        role: 'assistant',
        content: error.message || '发送失败',
        modelConfigId: null,
        modelName: null,
        createdAt: new Date().toISOString(),
        mark: 'error',
        status: 'failed',
      }
      messages.value.push(errorMessage)
    }
  }

  // 删除消息
  async function deleteMessage(id: number) {
    await $fetch(`/api/messages/${id}`, {
      method: 'DELETE',
    })
    messages.value = messages.value.filter(m => m.id !== id)
  }

  // 编辑消息
  async function editMessage(id: number, content: string) {
    await $fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      body: { content },
    })
    const index = messages.value.findIndex(m => m.id === id)
    if (index >= 0) {
      messages.value[index] = { ...messages.value[index], content }
    }
  }

  // 重放消息（让 AI 重新回复）
  async function replayMessage(message: Message) {
    // 如果是 AI 消息，先从本地移除
    if (message.role === 'assistant') {
      messages.value = messages.value.filter(m => m.id !== message.id)
    }

    try {
      const result = await $fetch<{ assistantMessageId: number }>(`/api/messages/${message.id}/replay`, {
        method: 'POST',
      })

      // 添加 AI 消息占位符
      const assistantMessage: Message = {
        id: result.assistantMessageId,
        conversationId: message.conversationId,
        role: 'assistant',
        content: '',
        modelConfigId: null,
        modelName: null,
        createdAt: new Date().toISOString(),
        status: 'created',
      }
      messages.value.push(assistantMessage)

      // 订阅 SSE 流
      subscribeToStream(result.assistantMessageId)
    } catch (error: any) {
      // 显示错误
      const errorMessage: Message = {
        id: Date.now(),
        conversationId: message.conversationId,
        role: 'assistant',
        content: error.message || '重放失败',
        modelConfigId: null,
        modelName: null,
        createdAt: new Date().toISOString(),
        mark: 'error',
        status: 'failed',
      }
      messages.value.push(errorMessage)
    }
  }

  // 清理状态
  function cleanup() {
    stopStreaming()
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
  async function stopStreaming() {
    if (streamingMessageId > 0) {
      try {
        // 调用后端停止接口
        await $fetch(`/api/messages/${streamingMessageId}/stop`, {
          method: 'POST',
        })
      } catch (error) {
        console.error('停止生成失败:', error)
      }
    }

    // 关闭 SSE 连接
    if (currentEventSource) {
      currentEventSource.abort()
      currentEventSource = null
    }

    // 立即结束打字机效果，保留已输出的内容
    flushTyping()

    // 更新消息状态
    const targetMessage = getStreamingMessage()
    if (targetMessage) {
      targetMessage.status = 'stopped'
    }

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
    const sendResult = await $fetch<{ userMessageId: number | null; assistantMessageId: number }>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: {
        content: result.compressRequest.content,
        isCompressRequest: true,
      },
    })

    // 找到压缩请求消息的位置，在其后插入 AI 消息
    const compressRequestIndex = messages.value.findIndex(m => m.mark === 'compress-request')
    const assistantMessage: Message = {
      id: sendResult.assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      modelConfigId: null,
      modelName: modelName || null,
      createdAt: new Date().toISOString(),
      mark: 'compress-response',
      status: 'created',
    }

    if (compressRequestIndex >= 0) {
      messages.value.splice(compressRequestIndex + 1, 0, assistantMessage)
    } else {
      messages.value.push(assistantMessage)
    }

    // 订阅 SSE 流
    subscribeToStream(sendResult.assistantMessageId)

    return result.stats
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
    startNewConversation,
    updateConversationTitle,
    deleteConversation,
    sendMessage,
    deleteMessage,
    editMessage,
    replayMessage,
    cleanup,
    addManualMessage,
    stopStreaming,
    compressConversation,
  }
}

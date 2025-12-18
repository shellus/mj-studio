// 对话状态管理
export interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  modelConfigId: number | null
  modelName: string | null
  createdAt: string
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
        const lastMessage = messages.value[messages.value.length - 1]
        if (lastMessage?.role === 'assistant') {
          lastMessage.content = displayedContent
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

    const lastMessage = messages.value[messages.value.length - 1]
    if (lastMessage?.role === 'assistant') {
      lastMessage.content = displayedContent
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
  async function sendMessage(conversationId: number, content: string) {
    isStreaming.value = true
    streamingContent.value = ''
    contentBuffer = ''
    displayedContent = ''

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
      modelName: null,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(tempAssistantMessage)

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, stream: true }),
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
          } catch (e) {
            // 忽略解析错误
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
      // 停止打字机效果
      flushTyping()
      // 移除临时助手消息
      messages.value.pop()
      throw error
    } finally {
      // 确保所有内容都显示完毕
      flushTyping()
      isStreaming.value = false
      streamingContent.value = ''
      contentBuffer = ''
      displayedContent = ''
    }
  }

  // 删除消息
  async function deleteMessage(id: number) {
    await $fetch(`/api/messages/${id}`, {
      method: 'DELETE',
    })
    messages.value = messages.value.filter(m => m.id !== id)
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
    cleanup,
  }
}

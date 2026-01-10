// 对话状态管理
// 适配独立流式订阅系统：消息 CRUD 通过全局 SSE，流式内容通过独立端点订阅
import type { MessageMark, MessageStatus, MessageFile } from '~/shared/types'
import { useAuth } from './useAuth'

export interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  files?: MessageFile[] | null
  modelDisplayName: string | null
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

// 上传中的文件状态
export interface UploadingFile {
  id: string
  name: string
  size: number
  mimeType: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  result?: MessageFile
  error?: string
  previewUrl?: string
}

// 每个对话的输入状态
export interface ConversationInputState {
  content: string
  uploadingFiles: UploadingFile[]
  showCompressHint: boolean
}

export function useConversations() {
  const conversations = useState<Conversation[]>('conversations', () => [])
  const messages = useState<Message[]>('messages', () => [])
  const isLoading = useState('conversations-loading', () => false)
  const currentConversationId = useState<number | null>('currentConversationId', () => null)
  // 当前加载的助手 ID（用于事件过滤）
  const currentAssistantId = useState<number | null>('currentAssistantId', () => null)

  // 按对话存储的输入状态
  const inputStates = useState<Record<number, ConversationInputState>>('conversation-input-states', () => ({}))

  // 按对话存储的 streaming 状态
  const streamingStates = useState<Record<number, {
    isStreaming: boolean
    messageId: number
  }>>('conversation-streaming-states', () => ({}))

  // 当前对话是否正在流式输出
  const isStreaming = computed(() => {
    if (!currentConversationId.value) return false
    return streamingStates.value[currentConversationId.value]?.isStreaming ?? false
  })

  // 新对话的输入状态（conversationId 为 null 时使用）
  const newConversationInputState = ref<ConversationInputState>({ content: '', uploadingFiles: [], showCompressHint: false })

  // 获取当前对话的输入状态
  function getInputState(conversationId: number | null): ConversationInputState {
    if (!conversationId) {
      return newConversationInputState.value
    }
    if (!inputStates.value[conversationId]) {
      inputStates.value[conversationId] = { content: '', uploadingFiles: [], showCompressHint: false }
    }
    return inputStates.value[conversationId]
  }

  // 更新输入内容
  function updateInputContent(conversationId: number | null, content: string) {
    if (!conversationId) {
      newConversationInputState.value.content = content
      return
    }
    if (!inputStates.value[conversationId]) {
      inputStates.value[conversationId] = { content: '', uploadingFiles: [], showCompressHint: false }
    }
    inputStates.value[conversationId].content = content
  }

  // 更新上传文件列表
  function updateUploadingFiles(conversationId: number | null, files: UploadingFile[]) {
    if (!conversationId) {
      newConversationInputState.value.uploadingFiles = files
      return
    }
    if (!inputStates.value[conversationId]) {
      inputStates.value[conversationId] = { content: '', uploadingFiles: [], showCompressHint: false }
    }
    inputStates.value[conversationId].uploadingFiles = files
  }

  // 更新压缩提醒状态
  function updateCompressHint(conversationId: number | null, show: boolean) {
    if (!conversationId) {
      newConversationInputState.value.showCompressHint = show
      return
    }
    if (!inputStates.value[conversationId]) {
      inputStates.value[conversationId] = { content: '', uploadingFiles: [], showCompressHint: false }
    }
    inputStates.value[conversationId].showCompressHint = show
  }

  // 清空输入状态
  function clearInputState(conversationId: number | null) {
    if (!conversationId) return
    if (inputStates.value[conversationId]) {
      // 释放预览 URL
      for (const file of inputStates.value[conversationId].uploadingFiles) {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl)
        }
      }
      inputStates.value[conversationId] = { content: '', uploadingFiles: [], showCompressHint: false }
    }
  }

  // 流式状态跟踪
  let streamingMessageId = -1 // 正在流式输出的消息 ID
  let streamingConversationId: number | null = null // 正在流式输出的对话 ID

  // ==================== 独立流式订阅管理 ====================

  // 当前活跃的流式订阅（messageId -> AbortController）
  const activeStreamSubscriptions = new Map<number, AbortController>()

  // 订阅单个消息的流式输出
  async function subscribeToMessageStream(messageId: number, conversationId: number, initialContent?: string) {
    // 如果已经在订阅，先取消
    if (activeStreamSubscriptions.has(messageId)) {
      activeStreamSubscriptions.get(messageId)?.abort()
      activeStreamSubscriptions.delete(messageId)
    }

    const { getAuthHeader } = useAuth()
    const abortController = new AbortController()
    activeStreamSubscriptions.set(messageId, abortController)

    // 开始流式状态
    startStreamingState(messageId, conversationId)

    // 如果有初始内容，设置到消息对象中
    if (initialContent) {
      const targetMessage = messages.value.find(m => m.id === messageId)
      if (targetMessage) {
        targetMessage.content = initialContent
      }
    }

    try {
      const response = await fetch(`/api/messages/${messageId}/stream`, {
        signal: abortController.signal,
        headers: getAuthHeader(),
      })

      if (!response.ok) {
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let firstDeltaReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 格式
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // 移除行末的 \r（如果有）
          const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line

          // 跳过空行和注释
          if (cleanLine === '' || cleanLine.startsWith(':')) {
            continue
          }

          // data: 纯文本内容
          if (cleanLine.startsWith('data:')) {
            const delta = cleanLine.slice(5)
            // 只去掉开头的一个空格（SSE 格式：data: content）
            const encodedContent = delta.startsWith(' ') ? delta.slice(1) : delta

            try {
              // 后端使用 JSON.stringify 编码，前端使用 JSON.parse 解码
              const content = JSON.parse(encodedContent)

              // 首次收到 delta，更新消息状态为 streaming
              if (!firstDeltaReceived && streamingMessageId === messageId) {
                firstDeltaReceived = true
                const targetMessage = messages.value.find(m => m.id === messageId)
                if (targetMessage) {
                  targetMessage.status = 'streaming'
                }
              }

              // 只有当前正在流式输出的消息是此 messageId 时才追加
              if (streamingMessageId === messageId) {
                const targetMessage = messages.value.find(m => m.id === messageId)
                if (targetMessage?.role === 'assistant') {
                  targetMessage.content = targetMessage.content + content
                }
              }
            } catch (err) {
              console.error('[MessageStream] JSON.parse 失败:', encodedContent, err)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
      } else {
      }
    } finally {
      activeStreamSubscriptions.delete(messageId)
    }
  }

  // 取消消息的流式订阅
  function unsubscribeFromMessageStream(messageId: number) {
    const abortController = activeStreamSubscriptions.get(messageId)
    if (abortController) {
      abortController.abort()
      activeStreamSubscriptions.delete(messageId)
    }
  }

  // 取消所有流式订阅
  function unsubscribeAllMessageStreams() {
    for (const [messageId, abortController] of activeStreamSubscriptions) {
      abortController.abort()
    }
    activeStreamSubscriptions.clear()
  }

  // 开始流式状态（由事件驱动调用）
  function startStreamingState(messageId: number, conversationId: number) {
    streamingStates.value[conversationId] = {
      isStreaming: true,
      messageId,
    }
    streamingMessageId = messageId
    streamingConversationId = conversationId
  }

  // 结束流式状态
  function endStreamingState(conversationId: number) {
    if (streamingStates.value[conversationId]) {
      streamingStates.value[conversationId].isStreaming = false
    }
    streamingMessageId = -1
    streamingConversationId = null
  }

  // ==================== 原有功能 ====================

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
    // 保存当前助手 ID（用于事件过滤）
    currentAssistantId.value = assistantId
    try {
      const result = await $fetch<Conversation[]>('/api/conversations', {
        query: { assistantId },
      })
      conversations.value = result
      // 清空当前对话选择
      currentConversationId.value = null
      messages.value = []
    } catch (error) {
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
        // 恢复流式状态（订阅流式输出，传入已有内容以支持中途加入）
        subscribeToMessageStream(streamingMsg.id, id, streamingMsg.content || '')
      }
    } catch (error) {
      messages.value = []
    }
  }

  // 创建对话
  // 对话添加通过全局 SSE 事件 chat.conversation.created 处理
  async function createConversation(assistantId: number, title?: string) {
    const conversation = await $fetch<Conversation>('/api/conversations', {
      method: 'POST',
      body: { assistantId, title },
    })
    // 不再本地 push，由 SSE 事件 handleConversationCreated 处理
    // 但需要设置当前对话 ID 以便后续操作
    currentConversationId.value = conversation.id
    messages.value = []
    return conversation
  }

  // 更新对话标题
  // 对话更新通过全局 SSE 事件 chat.conversation.updated 处理
  async function updateConversationTitle(id: number, title: string) {
    const updated = await $fetch<Conversation>(`/api/conversations/${id}`, {
      method: 'PUT',
      body: { title },
    })
    // 不再本地更新，由 SSE 事件 handleConversationUpdated 处理
    return updated
  }

  // 删除对话
  // 对话删除通过全局 SSE 事件 chat.conversation.deleted 处理
  async function deleteConversation(id: number) {
    await $fetch(`/api/conversations/${id}`, {
      method: 'DELETE',
    })
    // 不再本地操作，由 SSE 事件 handleConversationDeleted 处理
  }

  // 开始新对话（虚拟状态，发送消息时才创建）
  function startNewConversation() {
    currentConversationId.value = null
    messages.value = []
  }

  // 发送消息（全局 SSE 会推送响应）
  async function sendMessage(conversationId: number, content: string, files?: MessageFile[]) {
    try {
      // 发送 POST 请求创建消息（消息会通过全局 SSE 推送）
      await $fetch<{ userMessageId: number | null; assistantMessageId: number }>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { content, files },
      })

      // 更新对话列表中的更新时间
      const conversation = conversations.value.find(c => c.id === conversationId)
      if (conversation) {
        conversation.updatedAt = new Date().toISOString()
      }
    } catch (error: any) {
      // 发送失败，显示错误
      const errorMessage: Message = {
        id: Date.now() + 1,
        conversationId,
        role: 'assistant',
        content: error.message || '发送失败',
        modelDisplayName: null,
        createdAt: new Date().toISOString(),
        mark: 'error',
        status: 'failed',
      }
      messages.value.push(errorMessage)
    }
  }

  // 删除消息
  // 消息删除通过全局 SSE 事件 chat.message.deleted 处理
  async function deleteMessage(id: number) {
    await $fetch(`/api/messages/${id}`, {
      method: 'DELETE',
    })
    // 不再本地操作，由 SSE 事件 handleMessageDeleted 处理
  }

  // 编辑消息
  // 消息更新通过全局 SSE 事件 chat.message.updated 处理
  async function editMessage(id: number, content: string) {
    await $fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      body: { content },
    })
    // 不再本地操作，由 SSE 事件 handleMessageUpdated 处理
  }

  // 重放消息（让 AI 重新回复，全局 SSE 会推送响应）
  // 原消息删除通过 SSE 事件 chat.message.deleted 处理
  // 新 AI 消息通过 SSE 事件 chat.message.created 处理
  async function replayMessage(message: Message) {
    try {
      await $fetch<{ assistantMessageId: number }>(`/api/messages/${message.id}/replay`, {
        method: 'POST',
      })
      // 原消息删除和新 AI 消息都通过全局 SSE 推送
    } catch (error: any) {
      // 显示错误
      const errorMessage: Message = {
        id: Date.now(),
        conversationId: message.conversationId,
        role: 'assistant',
        content: error.message || '重放失败',
        modelDisplayName: null,
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
    // 清理所有输入状态
    for (const convId in inputStates.value) {
      const state = inputStates.value[convId]
      if (state) {
        for (const file of state.uploadingFiles) {
          if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl)
          }
        }
      }
    }
    inputStates.value = {}
    streamingStates.value = {}
  }

  // 手动添加消息（不触发AI回复）
  // 消息添加通过全局 SSE 事件 chat.message.created 处理，无需本地 push
  async function addManualMessage(conversationId: number, content: string, role: 'user' | 'assistant') {
    const message = await $fetch<Message>(`/api/conversations/${conversationId}/messages-manual`, {
      method: 'POST',
      body: { content, role },
    })
    // 不再本地 push，由 SSE 事件 handleMessageCreated 处理

    // 更新对话列表中的更新时间
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (conversation) {
      conversation.updatedAt = new Date().toISOString()
    }

    return message
  }

  // 停止流式输出
  async function stopStreaming(conversationId?: number) {
    const convId = conversationId ?? currentConversationId.value

    if (streamingMessageId > 0) {
      try {
        // 调用后端停止接口
        await $fetch(`/api/messages/${streamingMessageId}/stop`, {
          method: 'POST',
        })
      } catch (error) {
      }
    }

    // 更新消息状态为已停止
    if (streamingMessageId !== -1) {
      const targetMessage = messages.value.find(m => m.id === streamingMessageId)
      if (targetMessage) {
        targetMessage.status = 'stopped'
      }
    }

    // 清除该对话的 streaming 状态
    if (convId) {
      endStreamingState(convId)
    }
  }

  // 分叉对话：从指定消息处创建新对话
  // 新对话添加通过全局 SSE 事件 chat.conversation.created 处理
  async function forkConversation(messageId: number): Promise<Conversation> {
    const result = await $fetch<{
      success: boolean
      conversation: Conversation
      messageCount: number
    }>(`/api/messages/${messageId}/fork`, {
      method: 'POST',
    })
    // 不再本地操作，由 SSE 事件 handleConversationCreated 处理
    return result.conversation
  }

  // 删除指定消息及之前的所有消息
  // 消息删除通过全局 SSE 事件 chat.messages.deleted 处理
  async function deleteMessagesUntil(messageId: number): Promise<number> {
    const result = await $fetch<{
      success: boolean
      deletedCount: number
    }>(`/api/messages/${messageId}/delete-until`, {
      method: 'POST',
    })
    // 不再本地操作，由 SSE 事件 handleMessagesDeleted 处理
    return result.deletedCount
  }

  // 压缩对话
  async function compressConversation(conversationId: number, onStart?: () => void) {
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

    // 3. 发送压缩请求触发 AI 生成摘要（AI 消息会通过全局 SSE 推送）
    await $fetch<{ userMessageId: number | null; assistantMessageId: number }>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: {
        content: result.compressRequest.content,
        isCompressRequest: true,
      },
    })

    return result.stats
  }

  return {
    conversations,
    messages,
    isLoading,
    currentConversationId,
    currentConversation,
    isStreaming,
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
    forkConversation,
    deleteMessagesUntil,
    compressConversation,
    // 输入状态管理
    getInputState,
    updateInputContent,
    updateUploadingFiles,
    updateCompressHint,
    clearInputState,
    // 事件处理器需要的内部状态和方法（供插件使用）
    currentAssistantId,
    streamingStates,
    inputStates,
    subscribeToMessageStream,
    unsubscribeFromMessageStream,
    endStreamingState,
  }
}

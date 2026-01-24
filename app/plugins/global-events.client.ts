// 全局事件订阅插件
// 登录后自动建立 SSE 连接，并注册所有事件处理器

import { MESSAGE_MARK } from '~/shared/constants'
import type {
  ChatAssistantUpdated,
  ChatMessageCreated,
  ChatMessageDone,
  ChatConversationCreated,
  ChatConversationDeleted,
  ChatConversationUpdated,
  ChatMessageDeleted,
  ChatMessageUpdated,
  ChatMessagesDeleted,
  TaskCreated,
  TaskStatusUpdated,
  TaskDeleted,
  TaskRestored,
  TaskBlurUpdated,
  TasksBlurUpdated,
} from '~/shared/events'

export default defineNuxtPlugin(() => {
  const { loggedIn } = useAuth()
  const { on, connect, disconnect } = useGlobalEvents()

  // ==================== 助手事件处理器 ====================
  const { assistants } = useAssistants()

  on<ChatAssistantUpdated>('chat.assistant.updated', (data) => {
    const { assistant } = data
    const index = assistants.value.findIndex(a => a.id === assistant.id)
    const existing = assistants.value[index]
    if (index >= 0 && existing) {
      assistants.value[index] = {
        ...existing,
        id: assistant.id,
        name: assistant.name,
        description: assistant.description,
        avatar: assistant.avatar,
        systemPrompt: assistant.systemPrompt,
        aimodelId: assistant.aimodelId,
        isDefault: assistant.isDefault,
        suggestions: assistant.suggestions,
        conversationCount: assistant.conversationCount,
        enableThinking: assistant.enableThinking,
        pinnedAt: assistant.pinnedAt ? String(assistant.pinnedAt) : null,
        lastActiveAt: assistant.lastActiveAt ? String(assistant.lastActiveAt) : null,
      }
      if (assistant.isDefault) {
        assistants.value.forEach((a, i) => {
          if (i !== index) a.isDefault = false
        })
      }
    }
  })

  // ==================== 对话事件处理器 ====================
  const {
    conversations,
    messages,
    currentConversationId,
    currentAssistantId,
    streamingStates,
    inputStates,
    subscribeToMessageStream,
    unsubscribeFromMessageStream,
    endStreamingState,
  } = useConversations()
  const { upstreams } = useAvailableUpstreams()

  on<ChatMessageCreated>('chat.message.created', (data) => {
    const { conversationId, assistantId, lastActiveAt, message } = data

    // 更新助手的 lastActiveAt（用于排序）
    if (assistantId && lastActiveAt) {
      const assistant = assistants.value.find(a => a.id === assistantId)
      if (assistant) {
        assistant.lastActiveAt = lastActiveAt
      }
    }

    if (currentConversationId.value !== conversationId) return

    const existingIndex = messages.value.findIndex(m => m.id === message.id)
    const existing = messages.value[existingIndex]

    if (existingIndex >= 0 && existing) {
      existing.conversationId = message.conversationId
      existing.role = message.role
      if (existing.status !== 'streaming') {
        existing.content = message.content
      }
      existing.files = message.files
      existing.modelDisplayName = message.modelDisplayName ?? null
      existing.createdAt = message.createdAt || existing.createdAt
      existing.mark = message.mark as any
      existing.status = message.status as any
      existing.toolCallData = message.toolCallData
    } else {
      messages.value.push({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        files: message.files,
        modelDisplayName: message.modelDisplayName ?? null,
        createdAt: message.createdAt || new Date().toISOString(),
        mark: message.mark as any,
        status: message.status as any,
        toolCallData: message.toolCallData,
      })
    }

    if (message.role === 'assistant' &&
        (message.status === 'created' || message.status === 'pending' || message.status === 'streaming') &&
        currentConversationId.value === conversationId) {
      subscribeToMessageStream(message.id, conversationId, message.content || '')
    }
  })

  on<ChatMessageDone>('chat.message.done', (data) => {
    const { conversationId, messageId, status, error, estimatedTime, upstreamId, aimodelId } = data
    if (currentConversationId.value !== conversationId) return

    const targetMessage = messages.value.find(m => m.id === messageId)
    if (targetMessage) {
      targetMessage.status = status
      if (error) {
        targetMessage.content = error
        targetMessage.mark = MESSAGE_MARK.ERROR
      }
    }

    unsubscribeFromMessageStream(messageId)

    if (estimatedTime !== undefined && upstreamId && aimodelId) {
      const upstream = upstreams.value.find(u => u.id === upstreamId)
      if (upstream) {
        const aimodel = upstream.aimodels.find(m => m.id === aimodelId)
        if (aimodel) {
          aimodel.estimatedTime = estimatedTime
        }
      }
    }

    endStreamingState(conversationId)
  })

  on<ChatConversationCreated>('chat.conversation.created', (data) => {
    const { conversation } = data
    if (currentAssistantId.value !== null && conversation.assistantId !== currentAssistantId.value) return
    if (conversations.value.some(c => c.id === conversation.id)) return

    conversations.value.unshift({
      id: conversation.id,
      userId: conversation.userId,
      assistantId: conversation.assistantId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })
  })

  on<ChatConversationDeleted>('chat.conversation.deleted', (data) => {
    const { conversationId } = data
    conversations.value = conversations.value.filter(c => c.id !== conversationId)

    if (currentConversationId.value === conversationId) {
      currentConversationId.value = null
      messages.value = []
    }

    if (inputStates.value[conversationId]) {
      for (const file of inputStates.value[conversationId].uploadingFiles) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
      }
      delete inputStates.value[conversationId]
    }
    if (streamingStates.value[conversationId]) {
      delete streamingStates.value[conversationId]
    }
  })

  on<ChatConversationUpdated>('chat.conversation.updated', (data) => {
    const { conversation } = data
    const index = conversations.value.findIndex(c => c.id === conversation.id)
    if (index >= 0) {
      const existing = conversations.value[index]!
      conversations.value[index] = {
        id: existing.id,
        userId: existing.userId,
        assistantId: existing.assistantId,
        title: conversation.title,
        createdAt: existing.createdAt,
        updatedAt: conversation.updatedAt,
      }
    }
  })

  on<ChatMessageDeleted>('chat.message.deleted', (data) => {
    const { conversationId, messageId } = data
    if (currentConversationId.value !== conversationId) return
    messages.value = messages.value.filter(m => m.id !== messageId)
  })

  on<ChatMessageUpdated>('chat.message.updated', (data) => {
    const { conversationId, message } = data
    if (currentConversationId.value !== conversationId) return
    const targetMessage = messages.value.find(m => m.id === message.id)
    if (targetMessage) {
      targetMessage.content = message.content
    }
  })

  on<ChatMessagesDeleted>('chat.messages.deleted', (data) => {
    const { conversationId, messageIds } = data
    if (currentConversationId.value !== conversationId) return
    messages.value = messages.value.filter(m => !messageIds.includes(m.id))
  })

  // ==================== 任务事件处理器 ====================
  const { tasks, total, currentPage } = useTasks()

  on<TaskCreated>('task.created', (data) => {
    const { task } = data
    if (tasks.value.some(t => t.id === task.id)) return

    if (currentPage.value === 1) {
      $fetch<any>(`/api/tasks/${task.id}`).then(fullTask => {
        if (!tasks.value.some(t => t.id === task.id)) {
          tasks.value.unshift(fullTask)
          total.value += 1
        }
      }).catch(() => {})
    }
  })

  on<TaskStatusUpdated>('task.status.updated', (data) => {
    const { taskId, status, progress, resourceUrl, error, buttons, duration } = data
    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index < 0) return

    const existing = tasks.value[index]!
    tasks.value[index] = {
      ...existing,
      status: status as any,
      progress: progress !== undefined ? `${progress}%` : existing.progress,
      resourceUrl: resourceUrl !== undefined ? resourceUrl : existing.resourceUrl,
      error: error !== undefined ? error : existing.error,
      buttons: buttons !== undefined ? buttons : existing.buttons,
      duration: duration !== undefined ? duration : existing.duration,
    }
  })

  on<TaskDeleted>('task.deleted', (data) => {
    const { taskId } = data
    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index >= 0) {
      tasks.value.splice(index, 1)
      total.value = Math.max(0, total.value - 1)
    }
  })

  on<TaskRestored>('task.restored', () => {
    if (currentPage.value === 1) {
      // 触发重新加载
      useTasks().loadTasks(1)
    }
  })

  on<TaskBlurUpdated>('task.blur.updated', (data) => {
    const { taskId, isBlurred } = data
    const index = tasks.value.findIndex(t => t.id === taskId)
    if (index >= 0) {
      const existing = tasks.value[index]!
      tasks.value[index] = { ...existing, isBlurred }
    }
  })

  on<TasksBlurUpdated>('tasks.blur.updated', (data) => {
    const { taskIds, isBlurred } = data
    if (taskIds.length === 0) {
      tasks.value = tasks.value.map(t => ({ ...t, isBlurred }))
    } else {
      tasks.value = tasks.value.map(t =>
        taskIds.includes(t.id) ? { ...t, isBlurred } : t
      )
    }
  })

  // ==================== 连接管理 ====================
  watch(loggedIn, (newValue, oldValue) => {
    if (newValue && !oldValue) {
      connect()
    } else if (!newValue && oldValue) {
      disconnect()
    }
  }, { immediate: true })
})

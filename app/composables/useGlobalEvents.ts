// 全局事件订阅类型定义
// 与 server/services/globalEvents.ts 中的类型保持一致

export interface GlobalEventEnvelope<T = unknown> {
  id: string
  ts: number
  type: string
  data: T
}

export interface ChatMessageCreated {
  conversationId: number
  message: {
    id: number
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    files: any[] | null
    status: 'created' | 'pending' | 'streaming' | 'completed' | 'stopped' | 'failed' | null
    mark: string | null
    sortId: number | null
    createdAt?: string
    updatedAt?: string
  }
}

// ChatMessageDelta 已废弃，流式增量内容通过独立端点 GET /api/messages/[id]/stream 订阅

export interface ChatMessageDone {
  conversationId: number
  messageId: number
  status: 'completed' | 'stopped' | 'failed'
  error?: string
  estimatedTime?: number
  upstreamId?: number
  aimodelId?: number
}

// 对话事件类型
export interface ChatConversationCreated {
  conversation: {
    id: number
    userId: number
    assistantId: number
    title: string
    createdAt: string
    updatedAt: string
  }
}

export interface ChatConversationDeleted {
  conversationId: number
  assistantId: number
}

export interface ChatConversationUpdated {
  conversation: {
    id: number
    title: string
    updatedAt: string
  }
}

export interface ChatMessageDeleted {
  conversationId: number
  messageId: number
}

export interface ChatMessageUpdated {
  conversationId: number
  message: {
    id: number
    content: string
    updatedAt: string
  }
}

export interface ChatMessagesDeleted {
  conversationId: number
  messageIds: number[]
}

// 助手事件类型
export interface ChatAssistantUpdated {
  assistant: {
    id: number
    name: string
    description: string | null
    avatar: string | null
    systemPrompt: string | null
    aimodelId: number | null
    isDefault: boolean
    suggestions: string[] | null
    conversationCount: number
  }
}

// 绘图/视频任务事件类型
export interface TaskCreated {
  task: {
    id: number
    userId: number
    taskType: 'image' | 'video'
    modelType: string
    prompt: string
    status: string
    createdAt: string
  }
}

export interface TaskStatusUpdated {
  taskId: number
  status: string
  progress?: number
  resourceUrl?: string | null
  error?: string | null
  buttons?: any[] | null
  updatedAt: string
  duration?: number  // 实际耗时（秒），仅在任务完成时有值
}

export interface TaskDeleted {
  taskId: number
}

export interface TaskRestored {
  taskId: number
}

export interface TaskBlurUpdated {
  taskId: number
  isBlurred: boolean
}

export interface TasksBlurUpdated {
  taskIds: number[]
  isBlurred: boolean
}

// 事件处理器类型
export type GlobalEventHandler<T = unknown> = (data: T, envelope: GlobalEventEnvelope<T>) => void

// 全局状态
const isConnected = ref(false)
const isConnecting = ref(false)
const lastEventId = ref<string | null>(null)

// 事件处理器注册表
const handlers = new Map<string, Set<GlobalEventHandler<any>>>()

// 当前连接的 AbortController
let abortController: AbortController | null = null

// 重连定时器
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_DELAY = 3000 // 3秒后重连

export function useGlobalEvents() {
  const { getAuthHeader, loggedIn } = useAuth()

  // 注册事件处理器
  function on<T>(eventType: string, handler: GlobalEventHandler<T>): () => void {
    if (!handlers.has(eventType)) {
      handlers.set(eventType, new Set())
    }
    handlers.get(eventType)!.add(handler)

    // 返回取消注册函数
    return () => {
      const typeHandlers = handlers.get(eventType)
      if (typeHandlers) {
        typeHandlers.delete(handler)
        if (typeHandlers.size === 0) {
          handlers.delete(eventType)
        }
      }
    }
  }

  // 触发事件处理器
  function emit<T>(eventType: string, data: T, envelope: GlobalEventEnvelope<T>): void {
    const typeHandlers = handlers.get(eventType)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(data, envelope)
        } catch (err) {
          console.error(`[GlobalEvents] 事件处理器错误 (${eventType}):`, err)
        }
      }
    }
  }

  // 建立连接
  async function connect(): Promise<void> {
    if (isConnected.value || isConnecting.value) return
    if (!loggedIn.value) return

    isConnecting.value = true

    // 创建 AbortController
    abortController = new AbortController()

    try {
      const response = await fetch('/api/events', {
        signal: abortController.signal,
        headers: getAuthHeader(),
      })

      if (!response.ok) {
        throw new Error(`连接失败: ${response.status}`)
      }

      isConnected.value = true
      isConnecting.value = false
      console.log('[GlobalEvents] 连接已建立')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 格式
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent: { id?: string; event?: string; data?: string } = {}

        for (const line of lines) {
          const trimmed = line.trim()

          // 心跳（注释行）
          if (trimmed.startsWith(':')) {
            continue
          }

          // 空行表示事件结束
          if (trimmed === '') {
            if (currentEvent.data) {
              try {
                const envelope = JSON.parse(currentEvent.data) as GlobalEventEnvelope
                lastEventId.value = envelope.id

                // 触发事件
                emit(envelope.type, envelope.data, envelope)
              } catch (err) {
                console.error('[GlobalEvents] 解析事件失败:', err)
              }
            }
            currentEvent = {}
            continue
          }

          // 解析字段
          if (trimmed.startsWith('id:')) {
            currentEvent.id = trimmed.slice(3).trim()
          } else if (trimmed.startsWith('event:')) {
            currentEvent.event = trimmed.slice(6).trim()
          } else if (trimmed.startsWith('data:')) {
            currentEvent.data = trimmed.slice(5).trim()
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[GlobalEvents] 连接已取消')
        return
      }
      console.error('[GlobalEvents] 连接错误:', err)
    } finally {
      isConnected.value = false
      isConnecting.value = false
      abortController = null

      // 如果仍然登录中，尝试重连
      if (loggedIn.value) {
        scheduleReconnect()
      }
    }
  }

  // 断开连接
  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isConnected.value = false
    isConnecting.value = false
    console.log('[GlobalEvents] 连接已断开')
  }

  // 计划重连
  function scheduleReconnect(): void {
    if (reconnectTimer) return

    console.log(`[GlobalEvents] ${RECONNECT_DELAY / 1000} 秒后重连...`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY)
  }

  return {
    isConnected: readonly(isConnected),
    isConnecting: readonly(isConnecting),
    lastEventId: readonly(lastEventId),
    on,
    connect,
    disconnect,
  }
}

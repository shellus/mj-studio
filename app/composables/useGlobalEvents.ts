// 全局事件订阅
// 从共享模块导入事件类型

export type {
  GlobalEventEnvelope,
  GlobalEventHandler,
  ChatMessageCreated,
  ChatMessageDone,
  ChatMessageDeleted,
  ChatMessageUpdated,
  ChatMessagesDeleted,
  ChatConversationCreated,
  ChatConversationDeleted,
  ChatConversationUpdated,
  ChatAssistantUpdated,
  TaskCreated,
  TaskStatusUpdated,
  TaskDeleted,
  TaskRestored,
  TaskBlurUpdated,
  TasksBlurUpdated,
  MJButton,
  ToolCallStatusUpdated,
  ToolCallEventStatus,
} from '../shared/events'

import type { GlobalEventEnvelope, GlobalEventHandler } from '../shared/events'

// 全局状态
const isConnected = ref(false)
const isConnecting = ref(false)
const lastEventId = ref<string | null>(null)

// 事件处理器注册表
const handlers = new Map<string, Set<GlobalEventHandler<unknown>>>()

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
    handlers.get(eventType)!.add(handler as GlobalEventHandler<unknown>)

    // 返回取消注册函数
    return () => {
      const typeHandlers = handlers.get(eventType)
      if (typeHandlers) {
        typeHandlers.delete(handler as GlobalEventHandler<unknown>)
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
          handler(data, envelope as GlobalEventEnvelope<unknown>)
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
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

// 助手状态管理
import { useGlobalEvents, type ChatAssistantUpdated } from './useGlobalEvents'

export interface Assistant {
  id: number
  userId: number
  name: string
  description: string | null
  avatar: string | null
  systemPrompt: string | null
  aimodelId: number | null
  isDefault: boolean
  createdAt: string
  conversationCount: number
  suggestions?: string[] | null
  enableThinking: boolean
}

// 单例模式：防止事件处理器重复注册
let isAssistantEventRegistered = false

export function useAssistants() {
  const assistants = useState<Assistant[]>('assistants', () => [])
  const isLoading = useState('assistants-loading', () => false)
  // 使用 ref 而非 useState，避免跨页面状态残留，由 URL 驱动
  const currentAssistantId = ref<number | null>(null)

  // 注册全局事件处理器（单例模式）
  if (import.meta.client && !isAssistantEventRegistered) {
    isAssistantEventRegistered = true
    const { on } = useGlobalEvents()
    on<ChatAssistantUpdated>('chat.assistant.updated', (data) => {
      const { assistant } = data
      const index = assistants.value.findIndex(a => a.id === assistant.id)
      const existing = assistants.value[index]
      if (index >= 0 && existing) {
        // 更新助手信息（只更新事件中包含的字段，保留本地的 userId 和 createdAt）
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
        }

        // 如果设为默认，更新其他助手的默认状态
        if (assistant.isDefault) {
          assistants.value.forEach((a, i) => {
            if (i !== index) a.isDefault = false
          })
        }
      }
    })
  }

  // 当前选中的助手
  const currentAssistant = computed(() => {
    if (currentAssistantId.value) {
      return assistants.value.find(a => a.id === currentAssistantId.value)
    }
    return undefined
  })

  // 获取默认助手
  function getDefaultAssistant() {
    return assistants.value.find(a => a.isDefault) || assistants.value[0] || null
  }

  // 加载助手列表（不自动选中，由调用方决定）
  async function loadAssistants() {
    isLoading.value = true
    try {
      const result = await $fetch<Assistant[]>('/api/assistants')
      assistants.value = result
    } catch (error) {
      console.error('加载助手列表失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 选择助手
  function selectAssistant(id: number) {
    currentAssistantId.value = id
  }

  // 创建助手
  async function createAssistant(data: {
    name: string
    description?: string
    avatar?: string
    systemPrompt?: string
    aimodelId?: number
    isDefault?: boolean
  }) {
    const assistant = await $fetch<Assistant>('/api/assistants', {
      method: 'POST',
      body: data,
    })

    // 如果设为默认，更新其他助手的默认状态
    if (data.isDefault) {
      assistants.value.forEach(a => {
        a.isDefault = false
      })
    }

    // 新创建的助手对话数量为0
    assistants.value.unshift({ ...assistant, conversationCount: 0 })
    return assistant
  }

  // 更新助手
  async function updateAssistant(id: number, data: Partial<{
    name: string
    description: string | null
    avatar: string | null
    systemPrompt: string | null
    aimodelId: number | null
    isDefault: boolean
    enableThinking: boolean
  }>) {
    const updated = await $fetch<Assistant>(`/api/assistants/${id}`, {
      method: 'PUT',
      body: data,
    })

    // 如果设为默认，更新其他助手的默认状态
    if (data.isDefault) {
      assistants.value.forEach(a => {
        if (a.id !== id) a.isDefault = false
      })
    }

    const index = assistants.value.findIndex(a => a.id === id)
    if (index >= 0) {
      assistants.value[index] = updated
    }

    return updated
  }

  // 删除助手
  async function deleteAssistant(id: number) {
    await $fetch(`/api/assistants/${id}`, {
      method: 'DELETE',
    })
    assistants.value = assistants.value.filter(a => a.id !== id)

    // 如果删除的是当前选中的助手，切换到默认助手
    if (currentAssistantId.value === id) {
      const defaultAssistant = assistants.value.find(a => a.isDefault) || assistants.value[0]
      currentAssistantId.value = defaultAssistant?.id || null
    }
  }

  return {
    assistants,
    isLoading,
    currentAssistantId,
    currentAssistant,
    getDefaultAssistant,
    loadAssistants,
    selectAssistant,
    createAssistant,
    updateAssistant,
    deleteAssistant,
  }
}

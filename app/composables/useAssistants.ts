// 助手状态管理

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
  pinnedAt: string | null
  lastActiveAt: string | null
}

export function useAssistants() {
  const assistants = useState<Assistant[]>('assistants', () => [])
  const isLoading = useState('assistants-loading', () => false)
  // 使用 ref 而非 useState，避免跨页面状态残留，由 URL 驱动
  const currentAssistantId = ref<number | null>(null)

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

  // 收藏/取消收藏助手
  async function togglePinAssistant(id: number) {
    const updated = await $fetch<Assistant>(`/api/assistants/${id}/pin`, {
      method: 'POST',
    })

    const index = assistants.value.findIndex(a => a.id === id)
    if (index >= 0) {
      assistants.value[index] = updated
    }

    return updated
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
    togglePinAssistant,
  }
}

// 助手状态管理
export interface Assistant {
  id: number
  userId: number
  name: string
  description: string | null
  avatar: string | null
  systemPrompt: string | null
  modelConfigId: number | null
  modelName: string | null
  isDefault: boolean
  createdAt: string
  conversationCount: number
}

export function useAssistants() {
  const assistants = useState<Assistant[]>('assistants', () => [])
  const isLoading = useState('assistants-loading', () => false)
  const currentAssistantId = useState<number | null>('currentAssistantId', () => null)

  // 当前选中的助手
  const currentAssistant = computed(() => {
    if (currentAssistantId.value) {
      return assistants.value.find(a => a.id === currentAssistantId.value)
    }
    // 默认返回默认助手或第一个
    return assistants.value.find(a => a.isDefault) || assistants.value[0]
  })

  // 加载助手列表
  async function loadAssistants() {
    isLoading.value = true
    try {
      const result = await $fetch<Assistant[]>('/api/assistants')
      assistants.value = result
      // 如果没有选中的助手，选中默认助手
      if (!currentAssistantId.value && result.length > 0) {
        const defaultAssistant = result.find(a => a.isDefault) || result[0]
        currentAssistantId.value = defaultAssistant.id
      }
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
    modelConfigId?: number
    modelName?: string
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
    modelConfigId: number | null
    modelName: string | null
    isDefault: boolean
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

  // 增加助手的对话数量
  function incrementConversationCount(assistantId: number) {
    const assistant = assistants.value.find(a => a.id === assistantId)
    if (assistant) {
      assistant.conversationCount++
    }
  }

  // 减少助手的对话数量
  function decrementConversationCount(assistantId: number) {
    const assistant = assistants.value.find(a => a.id === assistantId)
    if (assistant && assistant.conversationCount > 0) {
      assistant.conversationCount--
    }
  }

  return {
    assistants,
    isLoading,
    currentAssistantId,
    currentAssistant,
    loadAssistants,
    selectAssistant,
    createAssistant,
    updateAssistant,
    deleteAssistant,
    incrementConversationCount,
    decrementConversationCount,
  }
}

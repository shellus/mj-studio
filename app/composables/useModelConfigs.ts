// 模型配置管理

type ModelType = 'midjourney' | 'gemini' | 'flux' | 'dalle' | 'doubao' | 'gpt4o-image' | 'grok-image' | 'qwen-image'
type ApiFormat = 'mj-proxy' | 'gemini' | 'dalle' | 'openai-chat'

// 模型类型配置
export interface ModelTypeConfig {
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  estimatedTime: number
}

// 完整的模型配置类型（设置页使用）
export interface ModelConfig {
  id: number
  userId: number
  name: string
  baseUrl: string
  apiKey: string
  modelTypeConfigs: ModelTypeConfig[]
  remark: string | null
  isDefault: boolean
  createdAt: string
}

export function useModelConfigs() {
  const configs = useState<ModelConfig[]>('modelConfigs', () => [])
  const isLoading = useState('modelConfigs-loading', () => false)

  // 加载配置列表
  async function loadConfigs() {
    isLoading.value = true
    try {
      const result = await $fetch<ModelConfig[]>('/api/model-configs')
      configs.value = result
    } catch (error) {
      console.error('加载模型配置失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 创建配置
  async function createConfig(data: {
    name: string
    baseUrl: string
    apiKey: string
    modelTypeConfigs: ModelTypeConfig[]
    remark?: string
    isDefault?: boolean
  }) {
    const config = await $fetch<ModelConfig>('/api/model-configs', {
      method: 'POST',
      body: data,
    })
    configs.value.push(config)
    return config
  }

  // 更新配置
  async function updateConfig(id: number, data: Partial<{
    name: string
    baseUrl: string
    apiKey: string
    modelTypeConfigs: ModelTypeConfig[]
    remark: string | null
    isDefault: boolean
  }>) {
    const updated = await $fetch<ModelConfig>(`/api/model-configs/${id}`, {
      method: 'PUT',
      body: data,
    })

    // 如果设为默认，更新其他配置的默认状态
    if (data.isDefault) {
      configs.value.forEach(c => {
        if (c.id !== id) c.isDefault = false
      })
    }

    const index = configs.value.findIndex(c => c.id === id)
    if (index >= 0) {
      configs.value[index] = updated
    }

    return updated
  }

  // 删除配置
  async function deleteConfig(id: number) {
    await $fetch(`/api/model-configs/${id}`, {
      method: 'DELETE',
    })
    configs.value = configs.value.filter(c => c.id !== id)
  }

  // 获取默认配置
  const defaultConfig = computed(() => {
    return configs.value.find(c => c.isDefault) || configs.value[0]
  })

  return {
    configs,
    isLoading,
    loadConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    defaultConfig,
  }
}

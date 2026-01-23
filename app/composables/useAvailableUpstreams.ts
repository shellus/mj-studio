// 可用上游配置管理（用于模型选择器等前台组件，不包含敏感信息）
import type { ModelCategory, ModelCapability } from '../shared/types'

// 可用模型类型（精简版，不包含敏感信息）
export interface AvailableAimodel {
  id: number
  category: ModelCategory
  modelType: string
  name: string
  capabilities: ModelCapability[] | null
  estimatedTime: number
  sortOrder: number
}

// 可用上游类型（精简版，不包含敏感信息）
export interface AvailableUpstream {
  id: number
  name: string
  sortOrder: number
  upstreamInfo?: {
    balance?: number
    updatedAt?: string
  } | null
  aimodels: AvailableAimodel[]
}

export function useAvailableUpstreams() {
  const upstreams = useState<AvailableUpstream[]>('available-upstreams', () => [])
  const isLoading = useState('available-upstreams-loading', () => false)

  // 加载可用上游配置列表
  async function loadUpstreams() {
    isLoading.value = true
    try {
      const result = await $fetch<AvailableUpstream[]>('/api/upstreams/available')
      upstreams.value = result
    } catch (error) {
      console.error('加载可用上游配置失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 根据 ID 获取上游配置
  function getUpstreamById(id: number): AvailableUpstream | undefined {
    return upstreams.value.find(u => u.id === id)
  }

  // 根据上游 ID 和模型 ID 获取 AI 模型
  function getAimodelById(upstreamId: number, aimodelId: number): AvailableAimodel | undefined {
    const upstream = getUpstreamById(upstreamId)
    return upstream?.aimodels.find(m => m.id === aimodelId)
  }

  return {
    upstreams,
    isLoading,
    loadUpstreams,
    getUpstreamById,
    getAimodelById,
  }
}

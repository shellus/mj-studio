// 上游配置管理
import type { ApiKeyConfig, ModelCategory, ModelType, ApiFormat, UpstreamPlatform, UpstreamInfo } from '../shared/types'

// AI 模型配置类型（子表数据）
export interface Aimodel {
  id: number
  upstreamId: number
  category: ModelCategory
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  name: string  // 显示名称（用户可自定义）
  estimatedTime: number
  keyName: string
  createdAt: string
}

// 完整的上游配置类型（包含 aimodels）
export interface Upstream {
  id: number
  userId: number
  name: string
  baseUrl: string
  apiKey: string
  apiKeys?: ApiKeyConfig[]
  remark: string | null
  sortOrder: number
  upstreamPlatform?: UpstreamPlatform | null
  userApiKey?: string | null
  upstreamInfo?: UpstreamInfo | null
  createdAt: string
  aimodels: Aimodel[]
}

// 创建/更新时的 AI 模型输入类型
export interface AimodelInput {
  id?: number  // 编辑时包含 ID，用于关联
  category: ModelCategory
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  name: string  // 显示名称（用户可自定义）
  estimatedTime?: number
  keyName?: string
}

export function useUpstreams() {
  const upstreams = useState<Upstream[]>('upstreams', () => [])
  const isLoading = useState('upstreams-loading', () => false)

  // 加载上游配置列表
  async function loadUpstreams() {
    isLoading.value = true
    try {
      const result = await $fetch<Upstream[]>('/api/upstreams')
      upstreams.value = result
    } catch (error) {
      console.error('加载上游配置失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 创建上游配置
  async function createUpstream(data: {
    name: string
    baseUrl: string
    apiKey: string
    apiKeys?: ApiKeyConfig[]
    aimodels: AimodelInput[]
    remark?: string
    sortOrder?: number
    upstreamPlatform?: UpstreamPlatform
    userApiKey?: string
  }) {
    const upstream = await $fetch<Upstream>('/api/upstreams', {
      method: 'POST',
      body: data,
    })
    upstreams.value.push(upstream)
    // 重新排序
    upstreams.value.sort((a, b) => a.sortOrder - b.sortOrder)
    return upstream
  }

  // 更新上游配置
  async function updateUpstream(id: number, data: Partial<{
    name: string
    baseUrl: string
    apiKey: string
    apiKeys: ApiKeyConfig[]
    aimodels: AimodelInput[]
    remark: string | null
    sortOrder: number
    upstreamPlatform: UpstreamPlatform | null
    userApiKey: string | null
  }>) {
    const updated = await $fetch<Upstream>(`/api/upstreams/${id}`, {
      method: 'PUT',
      body: data,
    })

    const index = upstreams.value.findIndex(u => u.id === id)
    if (index >= 0) {
      upstreams.value[index] = updated
    }

    // 重新排序
    upstreams.value.sort((a, b) => a.sortOrder - b.sortOrder)

    return updated
  }

  // 移动到最前
  async function moveToTop(id: number) {
    const upstream = upstreams.value.find(u => u.id === id)
    if (!upstream) return

    // 找到当前最小的 sortOrder，新值设为比它小 1
    const minSortOrder = Math.min(...upstreams.value.map(u => u.sortOrder))
    const newSortOrder = minSortOrder > 0 ? minSortOrder - 1 : minSortOrder - 1

    return updateUpstream(id, { sortOrder: newSortOrder })
  }

  // 删除上游配置
  async function deleteUpstream(id: number) {
    await $fetch(`/api/upstreams/${id}`, {
      method: 'DELETE',
    })
    upstreams.value = upstreams.value.filter(u => u.id !== id)
  }

  // 根据 ID 获取上游配置
  function getUpstreamById(id: number): Upstream | undefined {
    return upstreams.value.find(u => u.id === id)
  }

  // 根据上游 ID 和模型 ID 获取 AI 模型
  function getAimodelById(upstreamId: number, aimodelId: number): Aimodel | undefined {
    const upstream = getUpstreamById(upstreamId)
    return upstream?.aimodels.find(m => m.id === aimodelId)
  }

  // 查询余额
  async function queryBalance(id: number): Promise<{ success: boolean; error?: string; upstreamInfo?: UpstreamInfo }> {
    const result = await $fetch<{ success: boolean; error?: string; upstreamInfo?: UpstreamInfo }>(`/api/upstreams/${id}/balance`)

    // 查询成功后更新本地状态
    if (result.success && result.upstreamInfo) {
      const index = upstreams.value.findIndex(u => u.id === id)
      const upstream = upstreams.value[index]
      if (index >= 0 && upstream) {
        upstream.upstreamInfo = result.upstreamInfo
      }
    }

    return result
  }

  return {
    upstreams,
    isLoading,
    loadUpstreams,
    createUpstream,
    updateUpstream,
    moveToTop,
    deleteUpstream,
    getUpstreamById,
    getAimodelById,
    queryBalance,
  }
}

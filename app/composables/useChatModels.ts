// 对话模型配置管理
import type { Upstream, Aimodel } from './useUpstreams'

export function useChatModels() {
  const { upstreams, loadUpstreams } = useUpstreams()

  // 获取所有对话模型配置
  const chatModelConfigs = computed(() => {
    const result: Array<{
      upstream: Upstream
      aimodel: Aimodel
    }> = []

    for (const upstream of upstreams.value) {
      for (const aimodel of upstream.aimodels || []) {
        // 筛选对话模型（category 为 'chat'）
        if (aimodel.category === 'chat') {
          result.push({ upstream, aimodel })
        }
      }
    }

    return result
  })

  // 根据上游ID和模型ID获取对话模型
  function getChatModel(upstreamId: number, aimodelId: number) {
    return chatModelConfigs.value.find(
      item => item.upstream.id === upstreamId && item.aimodel.id === aimodelId
    )
  }

  // 根据上游ID和模型名获取对话模型
  function getChatModelByName(upstreamId: number, modelName: string) {
    return chatModelConfigs.value.find(
      item => item.upstream.id === upstreamId && item.aimodel.modelName === modelName
    )
  }

  // 获取默认对话模型（第一个可用的）
  const defaultChatModel = computed(() => {
    return chatModelConfigs.value[0]
  })

  return {
    chatModelConfigs,
    loadUpstreams,
    getChatModel,
    getChatModelByName,
    defaultChatModel,
  }
}

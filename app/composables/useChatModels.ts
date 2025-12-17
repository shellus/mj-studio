// 对话模型配置管理
import type { ModelConfig, ModelTypeConfig } from './useTasks'

export function useChatModels() {
  const { configs, loadConfigs } = useModelConfigs()

  // 获取所有对话模型配置
  const chatModelConfigs = computed(() => {
    const result: Array<{
      config: ModelConfig
      model: ModelTypeConfig
    }> = []

    for (const config of configs.value) {
      for (const model of config.modelTypeConfigs || []) {
        // 筛选对话模型（category 为 'chat' 或未定义但 apiFormat 为 'openai-chat' 的非绘图模型）
        const isChat = model.category === 'chat' ||
          (!model.category && model.apiFormat === 'openai-chat' && !isImageModel(model.modelType))

        if (isChat) {
          result.push({ config, model })
        }
      }
    }

    return result
  })

  // 判断是否是绘图模型
  function isImageModel(modelType: string): boolean {
    const imageModels = [
      'midjourney', 'gemini', 'flux', 'dalle', 'doubao',
      'gpt4o-image', 'grok-image', 'qwen-image'
    ]
    return imageModels.includes(modelType)
  }

  // 根据配置ID和模型名获取对话模型
  function getChatModel(configId: number, modelName: string) {
    return chatModelConfigs.value.find(
      item => item.config.id === configId && item.model.modelName === modelName
    )
  }

  // 获取默认对话模型（第一个可用的）
  const defaultChatModel = computed(() => {
    return chatModelConfigs.value[0]
  })

  return {
    chatModelConfigs,
    loadConfigs,
    getChatModel,
    defaultChatModel,
  }
}

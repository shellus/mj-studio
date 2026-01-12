// POST /api/prompts/optimize - AI 优化绘图提示词
import { getChatProvider } from '../../services/chatProviders'
import type { ChatApiFormat } from '../../services/chatProviders'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import { getErrorMessage } from '../../../app/shared/types'
import { USER_SETTING_KEYS } from '../../../app/shared/constants'

function buildModelInfo(targetModelType?: string, targetModelName?: string): string {
  if (!targetModelType && !targetModelName) {
    return ''
  }
  return `
目标绘图模型信息：
- 模型类型: ${targetModelType || '未指定'}
- 模型名称: ${targetModelName || '未指定'}

请根据目标模型的特点优化提示词。例如：
- Midjourney: 支持 --ar, --v, --style 等参数
- DALL-E: 偏好详细的场景描述
- Flux: 擅长真实感图片
- Stable Diffusion: 支持负面提示词`
}

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { prompt, aimodelId, targetModelType, targetModelName } = body

  if (!prompt?.trim()) {
    throw createError({
      statusCode: 400,
      message: '请提供需要优化的提示词',
    })
  }

  if (!aimodelId) {
    throw createError({
      statusCode: 400,
      message: '请先在设置中配置 AI 优化模型',
    })
  }

  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()
  const settingsService = useUserSettingsService()

  // 获取 AI 模型配置
  const aimodel = await aimodelService.getById(aimodelId)
  if (!aimodel) {
    throw createError({
      statusCode: 404,
      message: '模型配置不存在',
    })
  }

  // 获取上游配置
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    throw createError({
      statusCode: 404,
      message: '上游配置不存在',
    })
  }

  try {
    // 使用 aimodel 中的 keyName 和 modelName
    const keyName = aimodel.keyName
    const modelName = aimodel.modelName
    const apiFormat = aimodel.apiFormat as ChatApiFormat

    // 获取 ChatProvider
    const chatProvider = getChatProvider(apiFormat)
    if (!chatProvider) {
      throw createError({
        statusCode: 500,
        message: `不支持的聊天 API 格式: ${apiFormat}`,
      })
    }

    const chatService = chatProvider.createService(upstream, keyName)
    // 获取用户配置的提示词模板
    const optimizePromptTemplate = await settingsService.get<string>(user.id, USER_SETTING_KEYS.PROMPT_OPTIMIZE)
    // 替换占位符
    const modelInfo = buildModelInfo(targetModelType, targetModelName)
    const systemPrompt = optimizePromptTemplate.replace('{modelInfo}', modelInfo)
    const result = await chatService.chat(
      modelName,
      systemPrompt,
      [],
      prompt.trim()
    )

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || '优化失败',
      })
    }

    // 解析 JSON 响应
    const content = result.content?.trim() || ''
    let optimizedPrompt = content
    let negativePrompt = ''

    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(content)
      if (parsed.prompt) {
        optimizedPrompt = parsed.prompt
        negativePrompt = parsed.negativePrompt || ''
      }
    } catch {
      // 如果不是 JSON，直接使用原始内容作为提示词
      optimizedPrompt = content
    }

    return {
      success: true,
      optimizedPrompt,
      negativePrompt,
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      message: getErrorMessage(error),
    })
  }
})

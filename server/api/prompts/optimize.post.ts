// POST /api/prompts/optimize - AI 优化绘图提示词
import { getChatProvider } from '../../services/chatProviders'
import type { ChatApiFormat } from '../../services/chatProviders'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { getErrorMessage } from '../../../app/shared/types'

function buildSystemPrompt(targetModelType?: string, targetModelName?: string): string {
  const modelInfo = targetModelType || targetModelName
    ? `\n\n目标绘图模型信息：
- 模型类型: ${targetModelType || '未指定'}
- 模型名称: ${targetModelName || '未指定'}

请根据目标模型的特点优化提示词。例如：
- Midjourney: 支持 --ar, --v, --style 等参数
- DALL-E: 偏好详细的场景描述
- Flux: 擅长真实感图片
- Stable Diffusion: 支持负面提示词`
    : ''

  return `你是一个专业的 AI 绘图提示词优化专家。你的任务是将用户提供的简单描述优化为更详细、更专业的绘图提示词。
${modelInfo}
优化规则：
1. 保持原始描述的核心意图
2. 添加适当的艺术风格描述（如：油画、水彩、数字艺术等）
3. 添加光影、构图、色彩等专业描述
4. 添加质量相关的关键词（如：高清、细节丰富、8K等）
5. 使用英文输出，因为大多数 AI 绘图模型对英文提示词效果更好
6. 保持提示词简洁，避免过于冗长（建议 50-150 词）
7. 如果目标模型支持负面提示词（如 Flux、Stable Diffusion），可以提供负面提示词

输出格式（JSON）：
{
  "prompt": "优化后的正向提示词",
  "negativePrompt": "负面提示词（可选，仅当模型支持时提供）"
}

只输出 JSON，不要加任何解释或 markdown 代码块标记。`
}

export default defineEventHandler(async (event) => {
  // 需要登录
  await requireAuth(event)

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
    const systemPrompt = buildSystemPrompt(targetModelType, targetModelName)
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

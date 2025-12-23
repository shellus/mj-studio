// POST /api/assistants/[id]/suggestions - AI 生成对话开场白建议
import { useAssistantService } from '../../../services/assistant'
import { useModelConfigService } from '../../../services/modelConfig'
import { createChatService } from '../../../services/chat'
import { useSuggestionsCache } from '../../../services/suggestionsCache'
import type { LogContext } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '助手ID不能为空' })
  }

  const assistantId = parseInt(id, 10)
  if (isNaN(assistantId)) {
    throw createError({ statusCode: 400, message: '无效的助手ID' })
  }

  // 获取请求参数
  const body = await readBody(event)
  const refresh = body?.refresh === true

  // 获取助手
  const assistantService = useAssistantService()
  const assistant = await assistantService.getById(assistantId)

  if (!assistant) {
    throw createError({ statusCode: 404, message: '助手不存在' })
  }

  if (assistant.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此助手' })
  }

  if (!assistant.modelConfigId || !assistant.modelName) {
    // 助手未配置模型，返回空
    return { suggestions: [] }
  }

  // 检查缓存（非刷新模式）
  const cache = useSuggestionsCache()
  if (!refresh) {
    const cached = cache.get(assistantId)
    if (cached) {
      return { suggestions: cached }
    }
  }

  // 获取模型配置
  const modelConfigService = useModelConfigService()
  const modelConfig = await modelConfigService.getById(assistant.modelConfigId)

  if (!modelConfig) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 构建提示词
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
  })

  const prompt = `现在用户开始了一次新对话，当前时间是 ${timeStr}。
请根据你的角色定位，为用户提供 5 条开场白建议，帮助用户快速开始对话。
要求：
1. 每条建议简洁明了，10-30 字
2. 建议应该多样化，覆盖不同场景
3. 以 JSON 数组格式返回，例如：["问题1", "问题2", "问题3", "问题4", "问题5"]
4. 直接输出 JSON，不要加其他说明`

  // 调用 AI 生成
  const chatService = createChatService(modelConfig)

  const logContext: LogContext = {
    type: '开场白',
    assistantId,
    assistantName: assistant.name,
  }

  try {
    const response = await chatService.chat(
      assistant.modelName,
      assistant.systemPrompt || '你是一个智能助手。',
      [],
      prompt,
      undefined,
      undefined,
      logContext
    )

    if (!response.success || !response.content) {
      throw new Error(response.error || '生成失败')
    }

    // 解析 JSON
    let suggestions: string[] = []
    try {
      // 尝试提取 JSON 数组
      const content = response.content.trim()
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      }
    } catch {
      // 解析失败，返回空
      console.error('解析开场白 JSON 失败:', response.content)
    }

    // 确保是字符串数组，最多 5 条
    suggestions = suggestions
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 5)

    // 存入缓存
    if (suggestions.length > 0) {
      cache.set(assistantId, suggestions)
    }

    return { suggestions }
  } catch (error: any) {
    console.error('生成开场白失败:', error)
    // 失败不抛错，返回空
    return { suggestions: [] }
  }
})

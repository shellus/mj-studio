// POST /api/assistants/[id]/suggestions - AI 生成对话开场白建议
import { useAssistantService } from '../../../services/assistant'
import { useUpstreamService } from '../../../services/upstream'
import { useAimodelService } from '../../../services/aimodel'
import { useUserSettingsService } from '../../../services/userSettings'
import { createChatService } from '../../../services/chat'
import { createClaudeChatService } from '../../../services/claude'
import type { LogContext } from '../../../utils/logger'
import { USER_SETTING_KEYS } from '../../../../app/shared/constants'

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

  if (!assistant.aimodelId) {
    // 助手未配置模型，返回空
    return { suggestions: [] }
  }

  // 检查数据库缓存（非刷新模式）
  if (!refresh && assistant.suggestions && assistant.suggestions.length > 0) {
    return { suggestions: assistant.suggestions }
  }

  // 获取 AI 模型配置
  const aimodelService = useAimodelService()
  const aimodel = await aimodelService.getById(assistant.aimodelId)

  if (!aimodel) {
    throw createError({ statusCode: 404, message: '模型配置不存在' })
  }

  // 获取上游配置
  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)

  if (!upstream) {
    throw createError({ statusCode: 404, message: '上游配置不存在' })
  }

  // 获取用户设置
  const settingsService = useUserSettingsService()
  const suggestionsPrompt = await settingsService.get<string>(user.id, USER_SETTING_KEYS.PROMPT_SUGGESTIONS)
  const suggestionsCount = await settingsService.get<number>(user.id, USER_SETTING_KEYS.GENERAL_SUGGESTIONS_COUNT)

  // 构建时间字符串
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
  })

  // 替换占位符
  const prompt = suggestionsPrompt.replace('{time}', timeStr)

  // 使用 aimodel 中的 apiFormat 和 keyName
  const apiFormat = aimodel.apiFormat
  const keyName = aimodel.keyName

  // 根据 apiFormat 创建对应的聊天服务
  const chatService = apiFormat === 'claude'
    ? createClaudeChatService(upstream, keyName)
    : createChatService(upstream, keyName)

  const logContext: LogContext = {
    type: '开场白',
    assistantId,
    assistantName: assistant.name,
    keyName,
  }

  try {
    const response = await chatService.chat(
      aimodel.modelName,
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

    // 确保是字符串数组，限制数量
    suggestions = suggestions
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, suggestionsCount)

    // 存入数据库缓存
    if (suggestions.length > 0) {
      await assistantService.update(assistantId, user.id, { suggestions })
    }

    return { suggestions }
  } catch (error: any) {
    console.error('生成开场白失败:', error)
    // 失败不抛错，返回空
    return { suggestions: [] }
  }
})

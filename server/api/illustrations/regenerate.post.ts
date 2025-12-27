// POST /api/illustrations/regenerate - 重新生成插图（删除旧任务，创建新任务）
import { useTaskService } from '../../services/task'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import { USER_SETTING_KEYS } from '~~/app/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { uniqueId, prompt, model, negative } = body

  // 验证必填参数
  if (!uniqueId?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'uniqueId 是必填参数',
    })
  }

  if (!prompt?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'prompt 是必填参数',
    })
  }

  const taskService = useTaskService()

  // 1. 查找并删除旧任务
  const existingTask = await taskService.findByUniqueId(uniqueId.trim(), user.id)
  if (existingTask) {
    await taskService.deleteTask(existingTask.id, user.id)
  }

  // 2. 获取模型配置
  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()
  const userSettingsService = useUserSettingsService()

  let upstream: any
  let aimodel: any

  // 优先使用用户设置的默认嵌入式绘画配置
  const defaultUpstreamId = await userSettingsService.get<number>(
    user.id,
    USER_SETTING_KEYS.DRAWING_EMBEDDED_UPSTREAM_ID
  )
  const defaultAimodelId = await userSettingsService.get<number>(
    user.id,
    USER_SETTING_KEYS.DRAWING_EMBEDDED_AIMODEL_ID
  )

  if (defaultUpstreamId && defaultAimodelId) {
    const defaultUpstream = await upstreamService.getByIdSimple(defaultUpstreamId)
    const defaultAimodel = await aimodelService.getById(defaultAimodelId)
    if (defaultUpstream && defaultAimodel && defaultAimodel.upstreamId === defaultUpstreamId) {
      upstream = defaultUpstream
      aimodel = defaultAimodel
    }
  }

  // 如果没有默认配置，则根据 model 参数匹配
  if (!upstream || !aimodel) {
    const matchResult = await aimodelService.findByUserAndModelName(user.id, model, 'image')
    if (!matchResult) {
      throw createError({
        statusCode: 400,
        message: model
          ? `未找到匹配的绘图模型配置: ${model}`
          : '未找到可用的绘图模型配置，请先在设置中添加',
      })
    }
    upstream = matchResult.upstream
    aimodel = matchResult.aimodel
  }

  // 获取用户的 blurByDefault 设置
  const blurByDefault = await userSettingsService.get<boolean>(
    user.id,
    USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT
  )

  // 3. 创建新任务
  const task = await taskService.createTask({
    userId: user.id,
    upstreamId: upstream.id,
    aimodelId: aimodel.id,
    modelType: aimodel.modelType,
    apiFormat: aimodel.apiFormat,
    modelName: aimodel.modelName,
    prompt: prompt.trim(),
    negativePrompt: negative?.trim() || null,
    images: [],
    type: 'imagine',
    isBlurred: blurByDefault ?? true,
    uniqueId: uniqueId.trim(),
    sourceType: 'chat',
  })

  // 4. 提交任务
  taskService.submitTask(task.id).catch((err) => {
    console.error('[Illustration] 重新生成任务失败:', err)
  })

  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    resourceUrl: task.resourceUrl,
    error: task.error,
  }
})

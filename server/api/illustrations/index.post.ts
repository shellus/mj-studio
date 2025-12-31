// POST /api/illustrations - 查询或创建插图任务（幂等接口）
import { useTaskService } from '../../services/task'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import { emitToUser, type TaskCreated } from '../../services/globalEvents'
import { USER_SETTING_KEYS } from '~~/app/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { uniqueId, prompt, model, negative } = body
  // 显式转换为布尔值，确保默认为 false
  const autostart = body.autostart === true
  const regenerate = body.regenerate === true

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

  // 1. 根据 uniqueId 查询是否已存在任务
  const existingTask = await taskService.findByUniqueId(uniqueId.trim(), user.id)

  if (existingTask) {
    // 任务已存在，返回当前状态
    return formatTaskResponse(existingTask)
  }

  // 2. 任务不存在
  // 如果 autostart=false，不创建任务，返回空状态让前端显示"生成"按钮
  if (!autostart) {
    return {
      taskId: null,
      status: 'idle',
      progress: null,
      resourceUrl: null,
      error: null,
    }
  }

  // 3. autostart=true，创建并启动任务
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
    // 使用用户设置的默认配置
    const defaultUpstream = await upstreamService.getByIdSimple(defaultUpstreamId)
    const defaultAimodel = await aimodelService.getById(defaultAimodelId)
    if (defaultUpstream && defaultAimodel && defaultAimodel.upstreamId === defaultUpstreamId) {
      upstream = defaultUpstream
      aimodel = defaultAimodel
    }
  }

  // 如果没有默认配置或默认配置无效，则根据 model 参数匹配
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
  const blurByDefault = await userSettingsService.get<boolean>(user.id, USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT)

  // 4. 创建任务
  const modelParams = negative?.trim() ? { negativePrompt: negative.trim() } : undefined
  const task = await taskService.createTask({
    userId: user.id,
    upstreamId: upstream.id,
    aimodelId: aimodel.id,
    modelType: aimodel.modelType,
    apiFormat: aimodel.apiFormat,
    modelName: aimodel.modelName,
    prompt: prompt.trim(),
    modelParams,
    images: [],
    type: 'imagine',
    isBlurred: blurByDefault ?? true,
    uniqueId: uniqueId.trim(),
    sourceType: 'chat',
  })

  // 5. 广播任务创建事件
  await emitToUser<TaskCreated>(user.id, 'task.created', {
    task: {
      id: task.id,
      userId: task.userId,
      taskType: task.taskType,
      modelType: task.modelType,
      prompt: task.prompt ?? '',
      status: task.status,
      createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
    },
  })

  // 6. 提交任务（此时 autostart 一定为 true）
  taskService.submitTask(task.id).catch((err) => {
    console.error('[Illustration] 提交任务失败:', err)
  })

  return formatTaskResponse(task)
})

// 格式化任务响应
function formatTaskResponse(task: any) {
  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    resourceUrl: task.resourceUrl,
    error: task.error,
    isBlurred: task.isBlurred,
  }
}

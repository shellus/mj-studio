// POST /api/tasks - 创建任务（图片/视频）
import { useTaskService } from '../../services/task'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import type { ModelType, ApiFormat, TaskType } from '../../database/schema'
import { IMAGE_MODEL_TYPES, VIDEO_MODEL_TYPES, API_FORMATS, USER_SETTING_KEYS } from '../../../app/shared/constants'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const {
    taskType = 'image',  // 任务类型：image | video
    prompt,
    modelParams,  // 模型专用参数（JSON）
    images = [],
    type = 'imagine',
    aimodelId,
    modelType,
    apiFormat,
    modelName,
  } = body

  // 验证 AI 模型
  if (!aimodelId) {
    throw createError({
      statusCode: 400,
      message: '请选择模型',
    })
  }

  // 验证模型类型
  const validModelTypes = taskType === 'video' ? VIDEO_MODEL_TYPES : IMAGE_MODEL_TYPES
  if (!modelType || !(validModelTypes as readonly string[]).includes(modelType)) {
    throw createError({
      statusCode: 400,
      message: '请选择有效的模型类型',
    })
  }

  // 验证API格式（使用共享常量 API_FORMATS）
  if (!apiFormat || !API_FORMATS.includes(apiFormat)) {
    throw createError({
      statusCode: 400,
      message: '请选择API格式',
    })
  }

  // 验证 taskType 与 apiFormat 的兼容性
  if (taskType === 'video' && apiFormat !== 'video-unified') {
    throw createError({
      statusCode: 400,
      message: '视频任务仅支持 video-unified 格式',
    })
  }

  // 验证 AI 模型
  const aimodelService = useAimodelService()
  const aimodel = await aimodelService.getById(aimodelId)

  if (!aimodel) {
    throw createError({
      statusCode: 400,
      message: '无效的模型配置',
    })
  }

  // 获取上游配置（从 aimodel 获取 upstreamId）
  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)

  if (!upstream || upstream.userId !== user.id) {
    throw createError({
      statusCode: 400,
      message: '无效的上游配置',
    })
  }

  // 抠抠图必须有图片，不需要提示词
  if (apiFormat === 'koukoutu') {
    if (images.length === 0) {
      throw createError({
        statusCode: 400,
        message: '抠抠图需要上传图片',
      })
    }
  } else if (!prompt && type === 'imagine' && taskType === 'image') {
    throw createError({
      statusCode: 400,
      message: '请输入提示词',
    })
  }

  // 视频任务必须有提示词
  if (taskType === 'video' && !prompt) {
    throw createError({
      statusCode: 400,
      message: '视频任务需要输入提示词',
    })
  }

  // blend模式仅支持mj-proxy格式（图片任务专用）
  if (type === 'blend' && apiFormat !== 'mj-proxy') {
    throw createError({
      statusCode: 400,
      message: '混合模式仅支持MJ-Proxy格式',
    })
  }

  if (type === 'blend' && images.length < 2) {
    throw createError({
      statusCode: 400,
      message: '混合模式至少需要2张图片',
    })
  }

  const taskService = useTaskService()
  const userSettingsService = useUserSettingsService()

  // 获取用户的 blurByDefault 设置（仅图片任务使用）
  const blurByDefault = taskType === 'image'
    ? await userSettingsService.get<boolean>(user.id, USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT)
    : false

  // 1. 先保存到数据库（service 层会自动广播 task.created 事件）
  const task = await taskService.createTask({
    userId: user.id,
    upstreamId: aimodel.upstreamId,
    aimodelId,
    taskType,
    modelType,
    apiFormat,
    modelName: modelName || aimodel.modelName,
    prompt,
    modelParams,
    images: images,
    type,
    isBlurred: blurByDefault ?? true,
  })

  // 2. 异步提交到对应的生成服务（不阻塞响应）
  taskService.submitTask(task.id).catch((err) => {
    console.error('异步提交任务失败:', err)
  })

  // 3. 立即返回任务ID
  return {
    success: true,
    taskId: task.id,
    message: taskType === 'video' ? '视频任务已创建，正在提交到生成服务' : '任务已创建，正在提交到生成服务',
  }
})

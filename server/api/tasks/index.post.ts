// POST /api/tasks - 创建任务（图片/视频）
import { useTaskService } from '../../services/task'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import { USER_SETTING_KEYS } from '../../../app/shared/constants'
import { getProvider, getValidationRules, getAllApiFormats } from '../../services/providers'
import { IMAGE_MODEL_REGISTRY, VIDEO_MODEL_REGISTRY } from '../../services/providers/modelTypes'

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
  const validModelTypes = taskType === 'video'
    ? VIDEO_MODEL_REGISTRY.map(m => m.type)
    : IMAGE_MODEL_REGISTRY.map(m => m.type)
  if (!modelType || !validModelTypes.includes(modelType)) {
    throw createError({
      statusCode: 400,
      message: '请选择有效的模型类型',
    })
  }

  // 验证 API 格式
  const allApiFormats = getAllApiFormats()
  if (!apiFormat || !allApiFormats.includes(apiFormat)) {
    throw createError({
      statusCode: 400,
      message: '请选择API格式',
    })
  }

  // 验证 Provider 存在
  const provider = getProvider(apiFormat)
  if (!provider) {
    throw createError({
      statusCode: 400,
      message: `不支持的API格式: ${apiFormat}`,
    })
  }

  // 验证 taskType 与 Provider 分类的兼容性
  if (taskType === 'video' && provider.meta.category !== 'video') {
    throw createError({
      statusCode: 400,
      message: '视频任务需要使用视频类型的API格式',
    })
  }
  if (taskType === 'image' && provider.meta.category !== 'image') {
    throw createError({
      statusCode: 400,
      message: '图片任务需要使用图片类型的API格式',
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

  // 根据 Provider 验证规则检查
  const validation = getValidationRules(apiFormat)

  // 检查是否需要图片
  if (validation.requiresImage && images.length === 0) {
    throw createError({
      statusCode: 400,
      message: '此模式需要上传图片',
    })
  }

  // 检查是否需要提示词（默认需要，除非明确设为 false）
  const needsPrompt = validation.requiresPrompt !== false
  if (needsPrompt && !prompt && type === 'imagine') {
    throw createError({
      statusCode: 400,
      message: '请输入提示词',
    })
  }

  // blend 模式仅支持 mj-proxy 格式
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

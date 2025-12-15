// POST /api/tasks - 创建生图任务
import { useTaskService } from '../../services/task'
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelType } from '../../database/schema'

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireUserSession(event)

  const body = await readBody(event)
  const { prompt, base64Array = [], type = 'imagine', modelConfigId, modelType } = body

  // 验证模型配置
  if (!modelConfigId) {
    throw createError({
      statusCode: 400,
      message: '请选择模型配置',
    })
  }

  // 验证模型类型
  const validTypes: ModelType[] = ['midjourney', 'gemini']
  if (!modelType || !validTypes.includes(modelType)) {
    throw createError({
      statusCode: 400,
      message: '请选择模型类型',
    })
  }

  // 验证模型配置属于当前用户且支持该模型类型
  const modelConfigService = useModelConfigService()
  const config = await modelConfigService.getById(modelConfigId)

  if (!config || config.userId !== user.id) {
    throw createError({
      statusCode: 400,
      message: '无效的模型配置',
    })
  }

  // 验证配置支持该模型类型
  if (!config.types.includes(modelType)) {
    throw createError({
      statusCode: 400,
      message: '该配置不支持此模型类型',
    })
  }

  if (!prompt && type === 'imagine') {
    throw createError({
      statusCode: 400,
      message: '请输入提示词',
    })
  }

  // blend模式仅支持midjourney
  if (type === 'blend' && modelType !== 'midjourney') {
    throw createError({
      statusCode: 400,
      message: '混合模式仅支持Midjourney',
    })
  }

  if (type === 'blend' && base64Array.length < 2) {
    throw createError({
      statusCode: 400,
      message: '混合模式至少需要2张图片',
    })
  }

  const taskService = useTaskService()

  // 1. 先保存到数据库
  const task = await taskService.createTask({
    userId: user.id,
    modelConfigId,
    modelType,
    prompt,
    images: base64Array,
    type,
  })

  // 2. 异步提交到对应的生成服务（不阻塞响应）
  taskService.submitTask(task.id).catch((err) => {
    console.error('异步提交任务失败:', err)
  })

  // 3. 立即返回任务ID
  return {
    success: true,
    taskId: task.id,
    message: '任务已创建，正在提交到生成服务',
  }
})

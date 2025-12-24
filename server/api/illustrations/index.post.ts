// POST /api/illustrations - 查询或创建插图任务（幂等接口）
import { useTaskService } from '../../services/task'
import { useModelConfigService } from '../../services/modelConfig'
import type { ModelTypeConfig } from '../../database/schema'

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

  // 1. 根据 uniqueId 查询是否已存在任务
  const existingTask = await taskService.findByUniqueId(uniqueId.trim(), user.id)

  if (existingTask) {
    // 任务已存在，返回当前状态
    return formatTaskResponse(existingTask)
  }

  // 2. 任务不存在，需要创建新任务
  // 根据 model 参数匹配用户的模型配置
  const modelConfigService = useModelConfigService()
  const matchResult = await modelConfigService.findByModelName(user.id, model, 'image')

  if (!matchResult) {
    throw createError({
      statusCode: 400,
      message: model
        ? `未找到匹配的绘图模型配置: ${model}`
        : '未找到可用的绘图模型配置，请先在设置中添加',
    })
  }

  const { config, modelTypeConfig } = matchResult

  // 3. 创建任务
  const task = await taskService.createTask({
    userId: user.id,
    modelConfigId: config.id,
    modelType: modelTypeConfig.modelType,
    apiFormat: modelTypeConfig.apiFormat,
    modelName: modelTypeConfig.modelName,
    prompt: prompt.trim(),
    negativePrompt: negative?.trim() || null,
    images: [],
    type: 'imagine',
    isBlurred: false, // 嵌入式插图默认不模糊
    uniqueId: uniqueId.trim(),
    sourceType: 'chat',
  })

  // 4. 异步提交任务
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
    imageUrl: task.imageUrl,
    error: task.error,
  }
}

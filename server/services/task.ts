// 任务服务层 - 管理任务的CRUD和异步提交
import { db } from '../database'
import { tasks, modelConfigs, type Task, type TaskStatus, type ModelConfig, type ModelType, type ApiFormat, type ModelTypeConfig } from '../database/schema'
import { eq, desc, isNull, isNotNull, and, inArray, sql } from 'drizzle-orm'
import { createMJService, type MJTaskResponse } from './mj'
import { createGeminiService } from './gemini'
import { createDalleService } from './dalle'
import { createOpenAIChatService } from './openaiChat'
import { downloadImage, saveBase64Image, getImageUrl } from './image'
import { classifyFetchError, classifyError, ERROR_MESSAGES } from './errorClassifier'
import { logResponse } from './logger'
import type { GenerateResult } from './types'
import { DEFAULT_MODEL_NAMES } from '../../app/shared/constants'

// 存储每个任务的 AbortController，用于取消请求
const taskAbortControllers = new Map<number, AbortController>()

// 检查是否为 abort 错误（ofetch 会包装原始错误）
function isAbortError(error: any): boolean {
  return (
    error?.name === 'AbortError' ||
    error?.cause?.name === 'AbortError' ||
    error?.message?.includes('aborted') ||
    error?.message?.includes('abort')
  )
}

export function useTaskService() {
  // 创建任务（仅保存到数据库）
  async function createTask(data: {
    userId: number
    modelConfigId: number
    modelType: ModelType
    apiFormat: ApiFormat
    modelName?: string
    prompt?: string
    images?: string[]
    type?: 'imagine' | 'blend'
  }): Promise<Task> {
    const [task] = await db.insert(tasks).values({
      userId: data.userId,
      modelConfigId: data.modelConfigId,
      modelType: data.modelType,
      apiFormat: data.apiFormat,
      modelName: data.modelName ?? null,
      prompt: data.prompt ?? null,
      images: data.images ?? [],
      type: data.type ?? 'imagine',
      status: 'pending',
    }).returning()
    return task
  }

  // 更新任务状态
  async function updateTask(id: number, data: Partial<{
    status: TaskStatus
    upstreamTaskId: string | null
    progress: string | null
    imageUrl: string | null
    error: string | null
    buttons: Task['buttons']
  }>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()
    return updated
  }

  // 获取单个任务
  async function getTask(id: number): Promise<Task | undefined> {
    return db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    })
  }

  // 获取任务及其模型配置
  async function getTaskWithConfig(id: number): Promise<{ task: Task; config: ModelConfig } | undefined> {
    const task = await getTask(id)
    if (!task) return undefined

    const config = await db.query.modelConfigs.findFirst({
      where: eq(modelConfigs.id, task.modelConfigId),
    })
    if (!config) return undefined

    return { task, config }
  }

  // 获取用户任务列表（包含模型配置信息，支持分页）
  async function listTasks(userId: number, options: { page?: number; pageSize?: number } = {}): Promise<{
    tasks: Array<Task & { modelConfig?: ModelConfig }>
    total: number
    page: number
    pageSize: number
  }> {
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 20

    // 查询总数（不包含已删除）
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    const total = countResult?.count ?? 0

    // 查询分页数据（不包含已删除）
    const taskList = await db.query.tasks.findMany({
      where: and(eq(tasks.userId, userId), isNull(tasks.deletedAt)),
      orderBy: [desc(tasks.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })

    // 获取所有相关的模型配置
    const configIds = [...new Set(taskList.map(t => t.modelConfigId))]
    const configMap = new Map<number, ModelConfig>()
    for (const id of configIds) {
      const config = await db.query.modelConfigs.findFirst({
        where: eq(modelConfigs.id, id),
      })
      if (config) configMap.set(id, config)
    }

    return {
      tasks: taskList.map(task => ({
        ...task,
        modelConfig: configMap.get(task.modelConfigId),
      })),
      total,
      page,
      pageSize,
    }
  }

  // 软删除任务
  async function deleteTask(id: number, userId: number): Promise<boolean> {
    const [updated] = await db.update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning()
    return !!updated
  }

  // 获取回收站任务列表（支持分页）
  async function listTrashTasks(userId: number, options: { page?: number; pageSize?: number } = {}): Promise<{
    tasks: Array<Task & { modelConfig?: ModelConfig }>
    total: number
    page: number
    pageSize: number
  }> {
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 20

    // 查询回收站总数
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
    const total = countResult?.count ?? 0

    // 查询分页数据（已删除）
    const taskList = await db.query.tasks.findMany({
      where: and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)),
      orderBy: [desc(tasks.deletedAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })

    // 获取所有相关的模型配置
    const configIds = [...new Set(taskList.map(t => t.modelConfigId))]
    const configMap = new Map<number, ModelConfig>()
    for (const id of configIds) {
      const config = await db.query.modelConfigs.findFirst({
        where: eq(modelConfigs.id, id),
      })
      if (config) configMap.set(id, config)
    }

    return {
      tasks: taskList.map(task => ({
        ...task,
        modelConfig: configMap.get(task.modelConfigId),
      })),
      total,
      page,
      pageSize,
    }
  }

  // 恢复任务
  async function restoreTask(id: number, userId: number): Promise<boolean> {
    const [updated] = await db.update(tasks)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
      .returning()
    return !!updated
  }

  // 清空回收站（物理删除）
  async function emptyTrash(userId: number): Promise<number> {
    const deleted = await db.delete(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
      .returning()
    return deleted.length
  }

  // 批量更新模糊状态
  async function batchBlur(userId: number, isBlurred: boolean, taskIds?: number[]): Promise<void> {
    let condition = and(eq(tasks.userId, userId), isNull(tasks.deletedAt))
    if (taskIds && taskIds.length > 0) {
      condition = and(condition, inArray(tasks.id, taskIds))
    }

    await db.update(tasks)
      .set({ isBlurred, updatedAt: new Date() })
      .where(condition!)
  }

  // 提交任务（根据apiFormat选择服务）
  async function submitTask(taskId: number): Promise<void> {
    const data = await getTaskWithConfig(taskId)
    if (!data) {
      throw new Error('任务或模型配置不存在')
    }

    const { task, config } = data

    // 更新状态为提交中
    await updateTask(taskId, { status: 'submitting' })

    // 创建 AbortController 用于取消请求
    const controller = new AbortController()
    taskAbortControllers.set(taskId, controller)

    try {
      // 根据apiFormat选择不同的处理方式
      switch (task.apiFormat) {
        case 'mj-proxy':
          await submitToMJ(task, config)
          break
        case 'gemini':
          await submitToGemini(task, config, controller.signal)
          break
        case 'dalle':
          await submitToDalle(task, config, controller.signal)
          break
        case 'openai-chat':
          await submitToOpenAIChat(task, config, controller.signal)
          break
        default:
          await updateTask(taskId, {
            status: 'failed',
            error: `不支持的API格式: ${task.apiFormat}`,
          })
      }
    } finally {
      // 请求完成后清理 AbortController
      taskAbortControllers.delete(taskId)
    }
  }

  // 处理同步API的结果
  async function handleSyncResult(task: Task, config: ModelConfig, result: GenerateResult): Promise<void> {
    if (!result.success) {
      await updateTask(task.id, {
        status: 'failed',
        error: result.error || '生成失败',
      })
      return
    }

    // 保存图片到本地
    let fileName: string | null = null

    if (result.imageBase64) {
      const dataUrl = `data:${result.mimeType || 'image/png'};base64,${result.imageBase64}`
      fileName = saveBase64Image(dataUrl)
    } else if (result.imageUrl) {
      fileName = await downloadImage(result.imageUrl)
    }

    if (!fileName) {
      await updateTask(task.id, {
        status: 'failed',
        error: '保存图片到本地失败',
      })
      return
    }

    await updateTask(task.id, {
      status: 'success',
      progress: '100%',
      imageUrl: getImageUrl(fileName),
    })

    // 更新预计时间
    await updateEstimatedTime(config, task.modelType, task.createdAt)
  }

  // 提交到Gemini（同步API）
  async function submitToGemini(task: Task, config: ModelConfig, signal?: AbortSignal): Promise<void> {
    const gemini = createGeminiService(config.baseUrl, config.apiKey)
    const modelName = task.modelName || DEFAULT_MODEL_NAMES.gemini

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        result = await gemini.generateImageWithRef(task.prompt ?? '', task.images, modelName, task.id, signal)
      } else {
        result = await gemini.generateImage(task.prompt ?? '', modelName, task.id, signal)
      }
      await handleSyncResult(task, config, result)
    } catch (error: any) {
      // 如果是取消导致的错误，不更新状态（由取消逻辑处理）
      if (isAbortError(error)) {
        console.log(`[Task ${task.id}] 请求已被取消`)
        return
      }
      await updateTask(task.id, {
        status: 'failed',
        error: error.message || 'Gemini生成失败',
      })
    }
  }

  // 提交到DALL-E（同步API）
  async function submitToDalle(task: Task, config: ModelConfig, signal?: AbortSignal): Promise<void> {
    const dalle = createDalleService(config.baseUrl, config.apiKey)
    const modelName = task.modelName || DEFAULT_MODEL_NAMES.dalle

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        result = await dalle.generateImageWithRef(task.prompt ?? '', task.images, modelName, task.id, signal)
      } else {
        result = await dalle.generateImage(task.prompt ?? '', modelName, task.id, signal)
      }
      await handleSyncResult(task, config, result)
    } catch (error: any) {
      // 如果是取消导致的错误，不更新状态（由取消逻辑处理）
      if (isAbortError(error)) {
        console.log(`[Task ${task.id}] 请求已被取消`)
        return
      }
      await updateTask(task.id, {
        status: 'failed',
        error: error.message || 'DALL-E生成失败',
      })
    }
  }

  // 提交到OpenAI Chat（同步API）
  async function submitToOpenAIChat(task: Task, config: ModelConfig, signal?: AbortSignal): Promise<void> {
    const openai = createOpenAIChatService(config.baseUrl, config.apiKey)
    const modelName = task.modelName || DEFAULT_MODEL_NAMES['gpt4o-image']

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        result = await openai.generateImageWithRef(task.prompt ?? '', task.images, modelName, task.id, signal)
      } else {
        result = await openai.generateImage(task.prompt ?? '', modelName, task.id, signal)
      }
      await handleSyncResult(task, config, result)
    } catch (error: any) {
      // 如果是取消导致的错误，不更新状态（由取消逻辑处理）
      if (isAbortError(error)) {
        console.log(`[Task ${task.id}] 请求已被取消`)
        return
      }
      await updateTask(task.id, {
        status: 'failed',
        error: error.message || 'OpenAI Chat生成失败',
      })
    }
  }

  // 提交到MJ API（异步执行）
  async function submitToMJ(task: Task, config: ModelConfig): Promise<void> {
    const mj = createMJService(config.baseUrl, config.apiKey)

    try {
      let result
      if (task.type === 'blend') {
        result = await mj.blend(task.images ?? [], 'SQUARE', task.id)
      } else {
        result = await mj.imagine(task.prompt ?? '', task.images ?? [], task.id)
      }

      if (result.code !== 1) {
        await updateTask(task.id, {
          status: 'failed',
          error: result.description || ERROR_MESSAGES.UNKNOWN,
        })
        return
      }

      // 更新上游任务ID和状态
      await updateTask(task.id, {
        status: 'processing',
        upstreamTaskId: result.result,
      })
    } catch (error: any) {
      await updateTask(task.id, {
        status: 'failed',
        error: classifyFetchError(error),
      })
    }
  }

  // 同步任务状态（仅MJ需要轮询）
  async function syncTaskStatus(taskId: number): Promise<Task | undefined> {
    const data = await getTaskWithConfig(taskId)
    if (!data) return undefined

    const { task, config } = data

    // 非MJ任务不需要轮询
    if (task.apiFormat !== 'mj-proxy') {
      return task
    }

    // MJ任务需要轮询状态
    if (!task.upstreamTaskId) {
      return task
    }

    const mj = createMJService(config.baseUrl, config.apiKey)

    try {
      const mjTask = await mj.fetchTask(task.upstreamTaskId)

      // 映射MJ状态到本地状态
      let status: TaskStatus = task.status
      if (mjTask.status === 'SUCCESS') {
        status = 'success'
      } else if (mjTask.status === 'FAILURE') {
        status = 'failed'
      } else if (['IN_PROGRESS', 'SUBMITTED', 'MODAL'].includes(mjTask.status)) {
        status = 'processing'
      }

      // 处理图片URL：成功时下载到本地
      let imageUrl = mjTask.imageUrl || null
      if (status === 'success' && imageUrl && !imageUrl.startsWith('/api/images/')) {
        const fileName = await downloadImage(imageUrl)
        if (fileName) {
          imageUrl = getImageUrl(fileName)
        }
        // 下载失败时保留原始URL

        // 更新预计时间
        await updateEstimatedTime(config, task.modelType, task.createdAt)
      }

      // 对 MJ 的 failReason 进行分类
      let error: string | null = null
      if (mjTask.failReason) {
        error = classifyError({ message: mjTask.failReason })
        // 任务失败时，记录轮询响应到日志（覆盖提交成功的日志）
        logResponse(taskId, {
          status: 200,
          statusText: 'OK (Poll)',
          data: {
            status: mjTask.status,
            failReason: mjTask.failReason,
            progress: mjTask.progress,
          },
        })
      }

      return await updateTask(taskId, {
        status,
        progress: mjTask.progress || null,
        imageUrl,
        error,
        buttons: mjTask.buttons || null,
      })
    } catch (error: any) {
      // 查询失败不更新状态，仅记录错误
      console.error('同步任务状态失败:', error.message)
      return task
    }
  }

  // 更新预计时间
  async function updateEstimatedTime(config: ModelConfig, modelType: ModelType, startTime: Date): Promise<void> {
    try {
      const endTime = new Date()
      const actualTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

      // 找到对应的模型类型配置并更新预计时间
      const modelTypeConfigs = [...config.modelTypeConfigs]
      const index = modelTypeConfigs.findIndex(mtc => mtc.modelType === modelType)

      if (index >= 0) {
        modelTypeConfigs[index] = {
          ...modelTypeConfigs[index],
          estimatedTime: actualTime,
        }

        await db.update(modelConfigs)
          .set({ modelTypeConfigs })
          .where(eq(modelConfigs.id, config.id))

        console.log(`[Task] 更新 ${modelType} 预计时间: ${actualTime}s`)
      }
    } catch (error) {
      console.error('更新预计时间失败:', error)
    }
  }

  // 执行按钮动作（创建新任务，仅MJ支持）
  async function executeAction(parentTaskId: number, customId: string, userId: number): Promise<Task> {
    const data = await getTaskWithConfig(parentTaskId)
    if (!data) {
      throw new Error('父任务不存在')
    }

    const { task: parentTask, config } = data

    if (parentTask.apiFormat !== 'mj-proxy') {
      throw new Error('仅MJ-Proxy格式支持按钮动作')
    }

    if (!parentTask.upstreamTaskId) {
      throw new Error('父任务未提交')
    }

    // 创建新任务
    const [newTask] = await db.insert(tasks).values({
      userId,
      modelConfigId: parentTask.modelConfigId,
      modelType: parentTask.modelType,
      apiFormat: parentTask.apiFormat,
      modelName: parentTask.modelName,
      prompt: parentTask.prompt,
      images: parentTask.images,
      type: 'imagine',
      status: 'submitting',
    }).returning()

    const mj = createMJService(config.baseUrl, config.apiKey)

    try {
      const result = await mj.action(parentTask.upstreamTaskId, customId, newTask.id)

      if (result.code !== 1) {
        await updateTask(newTask.id, {
          status: 'failed',
          error: result.description || ERROR_MESSAGES.UNKNOWN,
        })
        return (await getTask(newTask.id))!
      }

      await updateTask(newTask.id, {
        status: 'processing',
        upstreamTaskId: result.result,
      })

      return (await getTask(newTask.id))!
    } catch (error: any) {
      await updateTask(newTask.id, {
        status: 'failed',
        error: classifyFetchError(error),
      })
      return (await getTask(newTask.id))!
    }
  }

  // 中止任务的 HTTP 请求
  function abortTask(taskId: number): boolean {
    const controller = taskAbortControllers.get(taskId)
    if (controller) {
      controller.abort()
      taskAbortControllers.delete(taskId)
      console.log(`[Task ${taskId}] AbortController.abort() 已调用`)
      return true
    }
    return false
  }

  return {
    createTask,
    updateTask,
    getTask,
    getTaskWithConfig,
    listTasks,
    deleteTask,
    listTrashTasks,
    restoreTask,
    emptyTrash,
    batchBlur,
    submitTask,
    syncTaskStatus,
    executeAction,
    abortTask,
  }
}

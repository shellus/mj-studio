// 任务服务层 - 管理任务的CRUD和异步提交
import { db } from '../database'
import { tasks, upstreams, aimodels, type Task, type TaskStatus, type TaskType, type Upstream, type Aimodel, type ModelType, type ApiFormat } from '../database/schema'
import type { ModelParams, ImageModelParams, TaskUpstreamSummary } from '../../app/shared/types'
import { eq, desc, isNull, isNotNull, and, inArray, sql, like, or } from 'drizzle-orm'
import { getProvider, getModelTypeDefaults, type GenerateParams, type AsyncService, type SyncService, type MJService } from './providers'
import { useUpstreamService } from './upstream'
import { useAimodelService } from './aimodel'
import { downloadFile, getFileUrl, readFileAsBase64, saveBase64File } from './file'
import { classifyFetchError, classifyError, ERROR_MESSAGES } from './errorClassifier'
import { logTaskResponse } from '../utils/httpLogger'
import { emitToUser, type TaskStatusUpdated, type TaskCreated, type TaskDeleted, type TaskRestored, type TaskBlurUpdated, type TasksBlurUpdated } from './globalEvents'
import { getErrorMessage } from '../../app/shared/types'

// 存储每个任务的 AbortController，用于取消请求
const taskAbortControllers = new Map<number, AbortController>()

// 检查是否为 abort 错误（ofetch 会包装原始错误）
function isAbortError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const err = error as { name?: string; cause?: { name?: string }; message?: string }
  return (
    err.name === 'AbortError' ||
    err.cause?.name === 'AbortError' ||
    err.message?.includes('aborted') ||
    err.message?.includes('abort')
  ) || false
}

export function useTaskService() {
  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 获取配置的 API Key（支持多 Key）
  function getApiKey(upstream: Upstream, aimodel?: Aimodel): string {
    return upstreamService.getApiKey(upstream, aimodel?.keyName)
  }

  // 将图片 URL 数组转换为 Base64 数组
  // fetchRemoteUrls: 是否下载远程 URL 转 base64（用于不支持 URL 的上游如抠抠图）
  async function convertImagesToBase64(images: string[] | undefined, fetchRemoteUrls: boolean = false): Promise<string[]> {
    if (!images || images.length === 0) return []

    const results: string[] = []
    for (const url of images) {
      // 如果已经是 base64，直接返回
      if (url.startsWith('data:')) {
        results.push(url)
        continue
      }

      // 尝试从本地文件读取
      // 支持 /api/files/xxx 和完整 URL 如 http://domain/api/files/xxx
      const localMatch = url.match(/\/api\/files\/(.+)$/)
      if (localMatch) {
        const base64 = readFileAsBase64(localMatch[1])
        if (base64) {
          results.push(base64)
          continue
        }
      }

      // 远程 URL 处理
      if (fetchRemoteUrls && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            const buffer = await response.arrayBuffer()
            const contentType = response.headers.get('content-type') || 'image/png'
            const base64 = `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`
            results.push(base64)
            continue
          }
        } catch {
          // 下载失败，保留原 URL
        }
      }

      // 兜底：保留原 URL
      results.push(url)
    }
    return results
  }

  // 创建任务（仅保存到数据库）
  async function createTask(data: {
    userId: number
    upstreamId: number
    aimodelId: number
    taskType?: TaskType
    modelType: ModelType
    apiFormat: ApiFormat
    modelName: string
    prompt?: string
    modelParams?: ModelParams
    images?: string[]
    type?: 'imagine' | 'blend'
    isBlurred?: boolean
    uniqueId?: string
    sourceType?: 'workbench' | 'chat' | 'api'
  }): Promise<Task> {
    const taskType = data.taskType ?? 'image'

    const [task] = await db.insert(tasks).values({
      userId: data.userId,
      upstreamId: data.upstreamId,
      aimodelId: data.aimodelId,
      taskType,
      modelType: data.modelType,
      apiFormat: data.apiFormat,
      modelName: data.modelName,
      prompt: data.prompt ?? null,
      modelParams: data.modelParams ?? null,
      images: data.images ?? [],
      type: data.type ?? 'imagine',
      status: 'pending',
      isBlurred: data.isBlurred ?? true,
      uniqueId: data.uniqueId ?? null,
      sourceType: data.sourceType ?? 'workbench',
    }).returning()

    if (!task) {
      throw new Error('创建任务失败')
    }

    // 广播任务创建事件
    await emitToUser<TaskCreated>(task.userId, 'task.created', {
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

    return task
  }

  // 根据 uniqueId 查找任务（用于嵌入式绘图组件）
  async function findByUniqueId(uniqueId: string, userId: number): Promise<Task | undefined> {
    return db.query.tasks.findFirst({
      where: and(eq(tasks.uniqueId, uniqueId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
    })
  }

  // 更新任务状态
  async function updateTask(id: number, data: Partial<{
    status: TaskStatus
    upstreamTaskId: string | null
    progress: string | null
    resourceUrl: string | null
    error: string | null
    buttons: Task['buttons']
    isBlurred: boolean
    createdAt: Date
    startedAt: Date  // 任务开始执行时间
    duration: number  // 实际耗时（秒）
  }>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()

    // 如果状态有变化，广播事件
    if (updated && data.status !== undefined) {
      await emitToUser<TaskStatusUpdated>(updated.userId, 'task.status.updated', {
        taskId: updated.id,
        status: updated.status,
        progress: updated.progress ? parseInt(updated.progress) : undefined,
        resourceUrl: updated.resourceUrl,
        error: updated.error,
        buttons: updated.buttons,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
        duration: data.duration,
      })
    }

    return updated
  }

  // 获取单个任务
  async function getTask(id: number): Promise<Task | undefined> {
    return db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    })
  }

  // 获取任务及其上游配置和模型（内部使用）
  async function getTaskWithConfig(id: number): Promise<{ task: Task; upstream: Upstream; aimodel: Aimodel } | undefined> {
    const task = await getTask(id)
    if (!task) return undefined

    const upstream = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, task.upstreamId),
    })
    if (!upstream) return undefined

    const aimodel = await db.query.aimodels.findFirst({
      where: eq(aimodels.id, task.aimodelId),
    })
    if (!aimodel) return undefined

    return { task, upstream, aimodel }
  }

  // 获取任务及精简的上游配置（用于 API 返回）
  async function getTaskWithSummary(id: number): Promise<{ task: Task; upstream: TaskUpstreamSummary } | undefined> {
    const result = await getTaskWithConfig(id)
    if (!result) return undefined

    return {
      task: result.task,
      upstream: getUpstreamSummary(result.upstream, result.aimodel),
    }
  }

  // 从完整配置中提取精简信息
  function getUpstreamSummary(upstream: Upstream, aimodel: Aimodel): TaskUpstreamSummary {
    return {
      name: upstream.name,
      estimatedTime: aimodel?.estimatedTime ?? null,
      aimodelName: aimodel?.name ?? '未知模型',
    }
  }

  // 获取用户任务列表（包含精简的上游配置信息，支持分页和筛选）
  async function listTasks(userId: number, options: {
    page?: number
    pageSize?: number
    sourceType?: 'workbench' | 'chat' | 'api' | 'all'
    taskType?: TaskType | 'all'
    keyword?: string
  } = {}): Promise<{
    tasks: Array<Task & { upstream?: TaskUpstreamSummary }>
    total: number
    page: number
    pageSize: number
  }> {
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 20
    const sourceType = options.sourceType ?? 'workbench'
    const taskTypeFilter = options.taskType ?? 'all'
    const keyword = options.keyword

    // 构建筛选条件
    const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)]

    // 来源筛选
    if (sourceType !== 'all') {
      conditions.push(eq(tasks.sourceType, sourceType))
    }

    // 任务类型筛选
    if (taskTypeFilter !== 'all') {
      conditions.push(eq(tasks.taskType, taskTypeFilter))
    }

    // 关键词筛选（搜索 prompt 和 uniqueId）
    if (keyword) {
      const keywordPattern = `%${keyword}%`
      conditions.push(
        or(
          like(tasks.prompt, keywordPattern),
          like(tasks.uniqueId, keywordPattern)
        )!
      )
    }

    const whereClause = and(...conditions)

    // 查询总数
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(whereClause)
    const total = countResult?.count ?? 0

    // 查询分页数据
    const taskList = await db.query.tasks.findMany({
      where: whereClause,
      orderBy: [desc(tasks.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })

    // 获取所有相关的上游配置和模型
    const upstreamIds = [...new Set(taskList.map(t => t.upstreamId))]
    const aimodelIds = [...new Set(taskList.map(t => t.aimodelId))]

    const upstreamMap = new Map<number, Upstream>()
    const aimodelMap = new Map<number, Aimodel>()

    for (const id of upstreamIds) {
      const upstream = await db.query.upstreams.findFirst({
        where: eq(upstreams.id, id),
      })
      if (upstream) upstreamMap.set(id, upstream)
    }

    for (const id of aimodelIds) {
      const aimodel = await db.query.aimodels.findFirst({
        where: eq(aimodels.id, id),
      })
      if (aimodel) aimodelMap.set(id, aimodel)
    }

    return {
      tasks: taskList.map(task => {
        const upstream = upstreamMap.get(task.upstreamId)
        const aimodel = aimodelMap.get(task.aimodelId)
        return {
          ...task,
          upstream: upstream && aimodel ? getUpstreamSummary(upstream, aimodel) : undefined,
        }
      }),
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

    if (updated) {
      await emitToUser<TaskDeleted>(userId, 'task.deleted', { taskId: id })
    }

    return !!updated
  }

  // 获取回收站任务列表（支持分页）
  async function listTrashTasks(userId: number, options: { page?: number; pageSize?: number } = {}): Promise<{
    tasks: Array<Task & { upstream?: TaskUpstreamSummary }>
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

    // 获取所有相关的上游配置和模型
    const upstreamIds = [...new Set(taskList.map(t => t.upstreamId))]
    const aimodelIds = [...new Set(taskList.map(t => t.aimodelId))]

    const upstreamMap = new Map<number, Upstream>()
    const aimodelMap = new Map<number, Aimodel>()

    for (const id of upstreamIds) {
      const upstream = await db.query.upstreams.findFirst({
        where: eq(upstreams.id, id),
      })
      if (upstream) upstreamMap.set(id, upstream)
    }

    for (const id of aimodelIds) {
      const aimodel = await db.query.aimodels.findFirst({
        where: eq(aimodels.id, id),
      })
      if (aimodel) aimodelMap.set(id, aimodel)
    }

    return {
      tasks: taskList.map(task => {
        const upstream = upstreamMap.get(task.upstreamId)
        const aimodel = aimodelMap.get(task.aimodelId)
        return {
          ...task,
          upstream: upstream && aimodel ? getUpstreamSummary(upstream, aimodel) : undefined,
        }
      }),
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

    if (updated) {
      await emitToUser<TaskRestored>(userId, 'task.restored', { taskId: id })
    }

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

    const updated = await db.update(tasks)
      .set({ isBlurred, updatedAt: new Date() })
      .where(condition!)
      .returning({ id: tasks.id })

    if (updated.length > 0) {
      const updatedIds = updated.map(t => t.id)
      await emitToUser<TasksBlurUpdated>(userId, 'tasks.blur.updated', {
        taskIds: updatedIds,
        isBlurred,
      })
    }
  }

  // 更新单个任务模糊状态
  async function updateBlur(id: number, userId: number, isBlurred: boolean): Promise<boolean> {
    const [updated] = await db.update(tasks)
      .set({ isBlurred, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning()

    if (updated) {
      await emitToUser<TaskBlurUpdated>(userId, 'task.blur.updated', {
        taskId: id,
        isBlurred,
      })
    }

    return !!updated
  }

  // 提交任务（根据apiFormat选择服务）
  async function submitTask(taskId: number): Promise<void> {
    const data = await getTaskWithConfig(taskId)
    if (!data) {
      throw new Error('任务或上游配置不存在')
    }

    const { task, upstream, aimodel } = data

    // 输出任务提交日志
    const promptPreview = task.prompt ? (task.prompt.length > 30 ? task.prompt.slice(0, 30) + '...' : task.prompt) : '(无提示词)'
    console.log(`[Task] 提交 | #${taskId} ${task.modelType}/${task.apiFormat} | 上游:${upstream.name} 模型:${task.modelName} Key:${aimodel.keyName} | ${promptPreview}`)

    // 更新状态为提交中，记录开始时间
    const startedAt = new Date()
    await updateTask(taskId, { status: 'submitting', startedAt })
    task.startedAt = startedAt  // 同步到内存对象，供后续使用

    // 创建 AbortController 用于取消请求
    const controller = new AbortController()
    taskAbortControllers.set(taskId, controller)

    try {
      // 获取 Provider
      const provider = getProvider(task.apiFormat)
      if (!provider) {
        await updateTask(taskId, {
          status: 'failed',
          error: `不支持的API格式: ${task.apiFormat}`,
        })
        return
      }

      const apiKey = getApiKey(upstream, aimodel)
      const service = provider.createService(upstream.baseUrl, apiKey)

      // 构建通用参数
      // 如果 Provider 不支持图片 URL，需要下载远程 URL 转 base64
      const fetchRemoteUrls = !provider.meta.validation.supportsImageUrl
      const params: GenerateParams = {
        taskId,
        prompt: task.prompt ?? '',
        images: task.images ? await convertImagesToBase64(task.images, fetchRemoteUrls) : undefined,
        modelName: task.modelName || getModelTypeDefaults(task.modelType as any)?.modelName || task.modelName,
        modelParams: task.modelParams as ImageModelParams | undefined,
        type: task.type as 'imagine' | 'blend' | undefined,
        signal: controller.signal,
      }

      if (provider.meta.isAsync) {
        // 异步 Provider：提交后等待轮询
        const asyncService = service as AsyncService
        const result = await asyncService.submit(params)

        await updateTask(taskId, {
          status: 'processing',
          upstreamTaskId: result.upstreamTaskId,
        })
      } else {
        // 同步 Provider：直接获取结果
        const syncService = service as SyncService
        const result = await syncService.generate(params)

        await handleSyncResult(task, upstream, aimodel, result)
      }
    } catch (error: unknown) {
      if (isAbortError(error)) {
        console.log(`[Task ${taskId}] 请求已被取消`)
        return
      }
      await updateTask(taskId, {
        status: 'failed',
        error: classifyFetchError(error),
      })
    } finally {
      // 请求完成后清理 AbortController
      taskAbortControllers.delete(taskId)
    }
  }

  // 处理同步API的结果
  async function handleSyncResult(task: Task, upstream: Upstream, aimodel: Aimodel, result: { success: boolean; resourceUrl?: string; imageBase64?: string; mimeType?: string; error?: string }): Promise<void> {
    if (!result.success) {
      await updateTask(task.id, {
        status: 'failed',
        error: result.error || '生成失败',
      })
      return
    }

    // 保存资源到本地
    let resourceUrl: string | null = null
    const logPrefix = `[Task] #${task.id}`

    if (result.resourceUrl) {
      // 从远程 URL 下载
      const fileName = await downloadFile(result.resourceUrl, logPrefix)
      if (fileName) {
        resourceUrl = getFileUrl(fileName)
      }
    } else if (result.imageBase64) {
      // 从 Base64 保存（如 Gemini、DALL-E b64_json）
      const mimeType = result.mimeType || 'image/png'
      const dataUrl = `data:${mimeType};base64,${result.imageBase64}`
      const saveResult = saveBase64File(dataUrl)
      if (saveResult) {
        resourceUrl = getFileUrl(saveResult.fileName)
      }
    }

    if (!resourceUrl) {
      await updateTask(task.id, {
        status: 'failed',
        error: '保存资源到本地失败',
      })
      return
    }

    // 计算实际耗时
    const duration = Math.round((Date.now() - task.startedAt!.getTime()) / 1000)

    await updateTask(task.id, {
      status: 'success',
      progress: '100%',
      resourceUrl,
      duration,
    })

    // 更新预计时间
    await updateEstimatedTime(aimodel, task.id, duration)
  }

  // 同步任务状态（异步 Provider 需要轮询）
  async function syncTaskStatus(taskId: number): Promise<Task | undefined> {
    const data = await getTaskWithConfig(taskId)
    if (!data) return undefined

    const { task, upstream, aimodel } = data

    // 获取 Provider
    const provider = getProvider(task.apiFormat)
    if (!provider || !provider.meta.isAsync) {
      return task
    }

    if (!task.upstreamTaskId) {
      return task
    }

    const apiKey = getApiKey(upstream, aimodel)
    const service = provider.createService(upstream.baseUrl, apiKey) as AsyncService
    const logPrefix = `[Task] #${task.id}`

    try {
      const result = await service.query(task.upstreamTaskId, task.id)

      let status: TaskStatus = task.status
      if (result.status === 'success') {
        status = 'success'
      } else if (result.status === 'failed') {
        status = 'failed'
      } else {
        status = 'processing'
      }

      // 处理资源 URL：成功时下载到本地
      let resourceUrl = result.resourceUrl || null
      let duration: number | undefined
      if (status === 'success' && resourceUrl && !resourceUrl.startsWith('/api/files/') && !resourceUrl.startsWith('/api/images/')) {
        duration = Math.round((Date.now() - task.startedAt!.getTime()) / 1000)
        const fileName = await downloadFile(resourceUrl, logPrefix)
        if (fileName) {
          resourceUrl = getFileUrl(fileName)
        }
        // 下载失败时保留原始 URL

        // 更新预计时间
        await updateEstimatedTime(aimodel, task.id, duration)
      }

      // 计算进度显示
      let progress: string | null = null
      if (status === 'success') {
        progress = '100%'
      } else if (result.progress !== undefined && result.progress > 0) {
        progress = `${Math.round(result.progress)}%`
      }

      // 处理 MJ 的特殊字段（buttons）
      let buttons: Task['buttons'] = null
      if (task.apiFormat === 'mj-proxy' && 'buttons' in result) {
        buttons = (result as { buttons?: Task['buttons'] }).buttons || null
      }

      // 处理错误信息分类
      let error: string | null = result.error || null
      if (error && task.apiFormat === 'mj-proxy') {
        error = classifyError({ message: error })
        // 任务失败时，记录轮询响应到日志
        logTaskResponse(task.id, {
          status: 200,
          statusText: 'OK (Poll)',
          body: {
            status: result.status,
            error: result.error,
            progress: result.progress,
          },
          durationMs: 0,
        })
      }

      return await updateTask(task.id, {
        status,
        progress,
        resourceUrl,
        error: error || (status === 'failed' ? '任务处理失败' : null),
        buttons,
        duration,
      })
    } catch (error: unknown) {
      console.error('同步任务状态失败:', getErrorMessage(error))
      return task
    }
  }

  // 更新预计时间
  async function updateEstimatedTime(aimodel: Aimodel, taskId: number, duration: number): Promise<void> {
    try {
      // 更新 aimodel 的预计时间
      await aimodelService.updateEstimatedTime(aimodel.id, duration)

      console.log(`[Task] #${taskId} 更新预计时间 | ${aimodel.name}: ${duration}s`)
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

    const { task: parentTask, upstream, aimodel } = data

    if (parentTask.apiFormat !== 'mj-proxy') {
      throw new Error('仅MJ-Proxy格式支持按钮动作')
    }

    if (!parentTask.upstreamTaskId) {
      throw new Error('父任务未提交')
    }

    // 创建新任务
    const [newTask] = await db.insert(tasks).values({
      userId,
      upstreamId: parentTask.upstreamId,
      aimodelId: parentTask.aimodelId,
      modelType: parentTask.modelType,
      apiFormat: parentTask.apiFormat,
      modelName: parentTask.modelName,
      prompt: parentTask.prompt,
      images: parentTask.images,
      type: 'imagine',
      status: 'submitting',
    }).returning()

    if (!newTask) {
      throw new Error('创建任务失败')
    }

    // 广播任务创建事件
    await emitToUser<TaskCreated>(userId, 'task.created', {
      task: {
        id: newTask.id,
        userId: newTask.userId,
        taskType: newTask.taskType,
        modelType: newTask.modelType,
        prompt: newTask.prompt ?? '',
        status: newTask.status,
        createdAt: newTask.createdAt instanceof Date ? newTask.createdAt.toISOString() : newTask.createdAt,
      },
    })

    // 获取 MJ Provider
    const provider = getProvider('mj-proxy')
    if (!provider) {
      await updateTask(newTask.id, {
        status: 'failed',
        error: 'MJ Provider 不可用',
      })
      return (await getTask(newTask.id))!
    }

    const apiKey = getApiKey(upstream, aimodel)
    const service = provider.createService(upstream.baseUrl, apiKey) as MJService

    try {
      const result = await service.action(parentTask.upstreamTaskId, customId, newTask.id)

      // action 成功时返回 upstreamTaskId，失败时会抛出错误
      await updateTask(newTask.id, {
        status: 'processing',
        upstreamTaskId: result.upstreamTaskId,
      })

      return (await getTask(newTask.id))!
    } catch (error: unknown) {
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
    getTaskWithSummary,
    findByUniqueId,
    listTasks,
    deleteTask,
    listTrashTasks,
    restoreTask,
    emptyTrash,
    batchBlur,
    updateBlur,
    submitTask,
    syncTaskStatus,
    executeAction,
    abortTask,
  }
}

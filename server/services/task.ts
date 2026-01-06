// 任务服务层 - 管理任务的CRUD和异步提交
import { db } from '../database'
import { tasks, upstreams, aimodels, type Task, type TaskStatus, type TaskType, type Upstream, type Aimodel, type ModelType, type ApiFormat } from '../database/schema'
import type { ModelParams, ImageModelParams, JimengVideoParams, VeoVideoParams, SoraVideoParams, GrokVideoParams } from '../../app/shared/types'
import { eq, desc, isNull, isNotNull, and, inArray, sql, like, or } from 'drizzle-orm'
import { createMJService } from './mj'
import { createGeminiService } from './gemini'
import { createDalleService } from './dalle'
import { createOpenAIChatService } from './openaiChat'
import { createKoukoutuService } from './koukoutu'
import { createVideoUnifiedService, type VideoCreateParams } from './videoUnified'
import { useUpstreamService } from './upstream'
import { useAimodelService } from './aimodel'
import { downloadFile, saveBase64Image, getFileUrl, readFileAsBase64 } from './file'
import { classifyFetchError, classifyError, ERROR_MESSAGES } from './errorClassifier'
import { logResponse } from './logger'
import type { GenerateResult } from './types'
import { DEFAULT_MODEL_NAMES } from '../../app/shared/constants'
import { emitToUser, type TaskStatusUpdated } from './globalEvents'

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
  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 获取配置的 API Key（支持多 Key）
  function getApiKey(upstream: Upstream, aimodel?: Aimodel): string {
    return upstreamService.getApiKey(upstream, aimodel?.keyName)
  }

  // 将本地 URL 数组转换为 Base64 数组
  function convertImagesToBase64(images: string[] | undefined): string[] {
    if (!images || images.length === 0) return []
    return images.map(url => {
      // 如果已经是 base64，直接返回
      if (url.startsWith('data:')) return url
      // 从本地 URL 提取文件名并读取为 base64
      const fileName = url.replace(/^\/api\/files\//, '')
      return readFileAsBase64(fileName) || url
    }).filter(Boolean) as string[]
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
    sourceType?: 'workbench' | 'chat'
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

  // 精简的上游配置信息（用于任务列表/详情）
  type TaskUpstreamSummary = {
    name: string
    estimatedTime: number | null
    aimodelName: string  // AI 模型的显示名称
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
    sourceType?: 'workbench' | 'chat' | 'all'
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
      throw new Error('任务或上游配置不存在')
    }

    const { task, upstream, aimodel } = data

    // 输出任务提交日志
    const promptPreview = task.prompt ? (task.prompt.length > 30 ? task.prompt.slice(0, 30) + '...' : task.prompt) : '(无提示词)'
    console.log(`[Task] 提交 | #${taskId} ${task.modelType}/${task.apiFormat} | 上游:${upstream.name} 模型:${task.modelName} Key:${aimodel.keyName} | ${promptPreview}`)

    // 更新状态为提交中
    await updateTask(taskId, { status: 'submitting' })

    // 创建 AbortController 用于取消请求
    const controller = new AbortController()
    taskAbortControllers.set(taskId, controller)

    try {
      // 根据apiFormat选择不同的处理方式
      switch (task.apiFormat) {
        case 'mj-proxy':
          await submitToMJ(task, upstream, aimodel)
          break
        case 'gemini':
          await submitToGemini(task, upstream, aimodel, controller.signal)
          break
        case 'dalle':
          await submitToDalle(task, upstream, aimodel, controller.signal)
          break
        case 'openai-chat':
          await submitToOpenAIChat(task, upstream, aimodel, controller.signal)
          break
        case 'koukoutu':
          await submitToKoukoutu(task, upstream, aimodel)
          break
        case 'video-unified':
          await submitToVideoUnified(task, upstream, aimodel)
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
  async function handleSyncResult(task: Task, upstream: Upstream, aimodel: Aimodel, result: GenerateResult): Promise<void> {
    if (!result.success) {
      await updateTask(task.id, {
        status: 'failed',
        error: result.error || '生成失败',
      })
      return
    }

    // 保存图片到本地
    let fileName: string | null = null
    const logPrefix = `[Task] #${task.id}`

    if (result.imageBase64) {
      const dataUrl = `data:${result.mimeType || 'image/png'};base64,${result.imageBase64}`
      fileName = saveBase64Image(dataUrl)
    } else if (result.resourceUrl) {
      fileName = await downloadFile(result.resourceUrl, logPrefix)
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
      resourceUrl: getFileUrl(fileName),
    })

    // 更新预计时间
    await updateEstimatedTime(aimodel, task.id, task.createdAt)
  }

  // 提交到Gemini（同步API）
  async function submitToGemini(task: Task, upstream: Upstream, aimodel: Aimodel, signal?: AbortSignal): Promise<void> {
    const gemini = createGeminiService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const modelName = task.modelName || DEFAULT_MODEL_NAMES.gemini

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        const base64Images = convertImagesToBase64(task.images)
        result = await gemini.generateImageWithRef(task.prompt ?? '', base64Images, modelName, task.id, signal)
      } else {
        result = await gemini.generateImage(task.prompt ?? '', modelName, task.id, signal)
      }
      await handleSyncResult(task, upstream, aimodel, result)
    } catch (error: any) {
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
  async function submitToDalle(task: Task, upstream: Upstream, aimodel: Aimodel, signal?: AbortSignal): Promise<void> {
    const dalle = createDalleService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const modelName = task.modelName || DEFAULT_MODEL_NAMES.dalle

    const modelParams = (task.modelParams ?? {}) as ImageModelParams

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        const base64Images = convertImagesToBase64(task.images)
        result = await dalle.generateImageWithRef(task.prompt ?? '', base64Images, modelName, task.id, signal, modelParams)
      } else {
        result = await dalle.generateImage(task.prompt ?? '', modelName, task.id, signal, modelParams)
      }
      await handleSyncResult(task, upstream, aimodel, result)
    } catch (error: any) {
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
  async function submitToOpenAIChat(task: Task, upstream: Upstream, aimodel: Aimodel, signal?: AbortSignal): Promise<void> {
    const openai = createOpenAIChatService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const modelName = task.modelName || DEFAULT_MODEL_NAMES['gpt4o-image']

    try {
      let result: GenerateResult
      if (task.images && task.images.length > 0) {
        const base64Images = convertImagesToBase64(task.images)
        result = await openai.generateImageWithRef(task.prompt ?? '', base64Images, modelName, task.id, signal)
      } else {
        result = await openai.generateImage(task.prompt ?? '', modelName, task.id, signal)
      }
      await handleSyncResult(task, upstream, aimodel, result)
    } catch (error: any) {
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

  // 提交到抠抠图 API（异步轮询）
  async function submitToKoukoutu(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<void> {
    // 抠抠图必须有参考图
    if (!task.images || task.images.length === 0) {
      await updateTask(task.id, {
        status: 'failed',
        error: '抠抠图需要上传图片',
      })
      return
    }

    const koukoutu = createKoukoutuService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const modelKey = task.modelName ?? 'background-removal'

    try {
      const base64Images = convertImagesToBase64(task.images)
      if (base64Images.length === 0) {
        await updateTask(task.id, {
          status: 'failed',
          error: '抠抠图服务必须提供参考图片',
        })
        return
      }
      const firstImage = base64Images[0]!  // 已经检查过数组长度,断言非空
      const result = await koukoutu.create(firstImage, modelKey, task.id)

      if (result.code !== 200) {
        await updateTask(task.id, {
          status: 'failed',
          error: result.message || ERROR_MESSAGES.UNKNOWN,
        })
        return
      }

      // 更新上游任务ID和状态
      await updateTask(task.id, {
        status: 'processing',
        upstreamTaskId: String(result.data.task_id),
      })
    } catch (error: any) {
      await updateTask(task.id, {
        status: 'failed',
        error: classifyFetchError(error),
      })
    }
  }

  // 提交到MJ API（异步执行）
  async function submitToMJ(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<void> {
    const mj = createMJService(upstream.baseUrl, getApiKey(upstream, aimodel))

    try {
      let result
      const base64Images = task.images ? convertImagesToBase64(task.images) : []
      if (task.type === 'blend') {
        result = await mj.blend(base64Images, 'SQUARE', task.id)
      } else {
        result = await mj.imagine(task.prompt ?? '', base64Images, task.id)
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

  // 提交到视频统一格式 API（异步轮询）
  async function submitToVideoUnified(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<void> {
    const videoService = createVideoUnifiedService(upstream.baseUrl, getApiKey(upstream, aimodel))

    try {
      const modelParams = task.modelParams ?? {}

      // 构建请求参数
      const params: VideoCreateParams = {
        model: task.modelName,
        prompt: task.prompt ?? '',
      }

      // 根据模型类型添加参数（使用类型断言）
      const modelType = aimodel.modelType

      if (modelType === 'jimeng-video') {
        const p = modelParams as JimengVideoParams
        if (p.aspectRatio) params.aspect_ratio = p.aspectRatio
        if (p.size) params.size = p.size
      } else if (modelType === 'veo') {
        const p = modelParams as VeoVideoParams
        if (p.aspectRatio) params.aspect_ratio = p.aspectRatio
        if (p.enhancePrompt !== undefined) params.enhance_prompt = p.enhancePrompt
        if (p.enableUpsample !== undefined) params.enable_upsample = p.enableUpsample
      } else if (modelType === 'sora') {
        const p = modelParams as SoraVideoParams
        if (p.orientation) params.orientation = p.orientation
        if (p.size) params.size = p.size
        if (p.duration) params.duration = p.duration
        if (p.watermark !== undefined) params.watermark = p.watermark
        if (p.private !== undefined) params.private = p.private
      } else if (modelType === 'grok-video') {
        const p = modelParams as GrokVideoParams
        if (p.aspectRatio) params.aspect_ratio = p.aspectRatio
        if (p.size) params.size = p.size
      }

      // 参考图（转换为 Base64）
      if (task.images && task.images.length > 0) {
        params.images = convertImagesToBase64(task.images)
      }

      const result = await videoService.create(params, task.id)

      // 更新上游任务ID和状态
      await updateTask(task.id, {
        status: 'processing',
        upstreamTaskId: result.id,
      })
    } catch (error: any) {
      await updateTask(task.id, {
        status: 'failed',
        error: classifyFetchError(error),
      })
    }
  }

  // 同步任务状态（MJ、抠抠图、视频需要轮询）
  async function syncTaskStatus(taskId: number): Promise<Task | undefined> {
    const data = await getTaskWithConfig(taskId)
    if (!data) return undefined

    const { task, upstream, aimodel } = data

    // 根据 apiFormat 选择轮询方式
    if (task.apiFormat === 'koukoutu') {
      return await syncKoukoutuStatus(task, upstream, aimodel)
    } else if (task.apiFormat === 'mj-proxy') {
      return await syncMJStatus(task, upstream, aimodel)
    } else if (task.apiFormat === 'video-unified') {
      return await syncVideoUnifiedStatus(task, upstream, aimodel)
    }

    return task
  }

  // 同步抠抠图任务状态
  async function syncKoukoutuStatus(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<Task | undefined> {
    if (!task.upstreamTaskId) {
      return task
    }

    const koukoutu = createKoukoutuService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const logPrefix = `[Task] #${task.id}`

    try {
      const result = await koukoutu.query(task.upstreamTaskId)

      let status: TaskStatus = task.status
      let resourceUrl: string | null = null

      if (result.data.state === 1) {
        // 成功
        status = 'success'
        if (result.data.result_file) {
          const fileName = await downloadFile(result.data.result_file, logPrefix)
          if (fileName) {
            resourceUrl = getFileUrl(fileName)
          }
          await updateEstimatedTime(aimodel, task.id, task.createdAt)
        }
      } else if (result.data.state === -1) {
        // 失败
        status = 'failed'
      }
      // state === 0 表示处理中，保持 processing 状态

      return await updateTask(task.id, {
        status,
        progress: status === 'success' ? '100%' : null,
        resourceUrl,
        error: status === 'failed' ? '抠图处理失败' : null,
      })
    } catch (error: any) {
      console.error('同步抠抠图任务状态失败:', error.message)
      return task
    }
  }

  // 同步 MJ 任务状态
  async function syncMJStatus(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<Task | undefined> {
    if (!task.upstreamTaskId) {
      return task
    }

    const mj = createMJService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const logPrefix = `[Task] #${task.id}`

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
      let resourceUrl = mjTask.imageUrl || null
      if (status === 'success' && resourceUrl && !resourceUrl.startsWith('/api/images/')) {
        const fileName = await downloadFile(resourceUrl, logPrefix)
        if (fileName) {
          resourceUrl = getFileUrl(fileName)
        }
        // 下载失败时保留原始URL

        // 更新预计时间
        await updateEstimatedTime(aimodel, task.id, task.createdAt)
      }

      // 对 MJ 的 failReason 进行分类
      let error: string | null = null
      if (mjTask.failReason) {
        error = classifyError({ message: mjTask.failReason })
        // 任务失败时，记录轮询响应到日志（覆盖提交成功的日志）
        logResponse(task.id, {
          status: 200,
          statusText: 'OK (Poll)',
          data: {
            status: mjTask.status,
            failReason: mjTask.failReason,
            progress: mjTask.progress,
          },
        })
      }

      return await updateTask(task.id, {
        status,
        progress: mjTask.progress || null,
        resourceUrl,
        error,
        buttons: mjTask.buttons || null,
      })
    } catch (error: any) {
      // 查询失败不更新状态，仅记录错误
      console.error('同步任务状态失败:', error.message)
      return task
    }
  }

  // 同步视频统一格式任务状态
  async function syncVideoUnifiedStatus(task: Task, upstream: Upstream, aimodel: Aimodel): Promise<Task | undefined> {
    if (!task.upstreamTaskId) {
      return task
    }

    const videoService = createVideoUnifiedService(upstream.baseUrl, getApiKey(upstream, aimodel))
    const logPrefix = `[Task] #${task.id}`

    try {
      const result = await videoService.query(task.upstreamTaskId, task.id)

      // 状态已在 videoUnified 服务中归一化
      const status: TaskStatus = result.status

      // 处理视频 URL：成功时下载到本地
      let resourceUrl = result.video_url || null
      if (status === 'success' && resourceUrl && !resourceUrl.startsWith('/api/files/')) {
        const fileName = await downloadFile(resourceUrl, logPrefix)
        if (fileName) {
          resourceUrl = getFileUrl(fileName)
        }
        // 下载失败时保留原始 URL

        // 更新预计时间
        await updateEstimatedTime(aimodel, task.id, task.createdAt)
      }

      // 计算进度显示
      let progress: string | null = null
      if (status === 'success') {
        progress = '100%'
      } else if (result.progress !== undefined && result.progress > 0) {
        progress = `${Math.round(result.progress)}%`
      }

      return await updateTask(task.id, {
        status,
        progress,
        resourceUrl,
        error: result.error || (status === 'failed' ? '视频生成失败' : null),
      })
    } catch (error: any) {
      console.error('同步视频任务状态失败:', error.message, error.stack)
      return task
    }
  }

  // 更新预计时间
  async function updateEstimatedTime(aimodel: Aimodel, taskId: number, startTime: Date): Promise<void> {
    try {
      const endTime = new Date()
      const actualTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

      // 更新 aimodel 的预计时间
      await aimodelService.updateEstimatedTime(aimodel.id, actualTime)

      console.log(`[Task] #${taskId} 更新预计时间 | ${aimodel.name}: ${actualTime}s`)
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

    const mj = createMJService(upstream.baseUrl, getApiKey(upstream, aimodel))

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
    getTaskWithSummary,
    findByUniqueId,
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

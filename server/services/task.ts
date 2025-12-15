// 任务服务层 - 管理任务的CRUD和异步提交
import { db } from '../database'
import { tasks, modelConfigs, type Task, type TaskStatus, type ModelConfig, type ModelType } from '../database/schema'
import { eq, desc, and } from 'drizzle-orm'
import { createMJService, type MJTaskResponse } from './mj'
import { createGeminiService } from './gemini'

export function useTaskService() {
  // 创建任务（仅保存到数据库）
  async function createTask(data: {
    userId: number
    modelConfigId: number
    modelType: ModelType
    prompt?: string
    images?: string[]
    type?: 'imagine' | 'blend'
  }): Promise<Task> {
    const [task] = await db.insert(tasks).values({
      userId: data.userId,
      modelConfigId: data.modelConfigId,
      modelType: data.modelType,
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

  // 获取用户任务列表（包含模型配置信息）
  async function listTasks(userId: number, limit = 50): Promise<Array<Task & { modelConfig?: ModelConfig }>> {
    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.userId, userId),
      orderBy: [desc(tasks.createdAt)],
      limit,
    })

    // 获取所有相关的模型配置
    const configIds = [...new Set(taskList.map(t => t.modelConfigId))]
    const configs = await db.query.modelConfigs.findMany({
      where: configIds.length > 0
        ? eq(modelConfigs.id, configIds[0]) // TODO: 使用 inArray
        : undefined,
    })

    // 如果有多个配置ID，需要查询所有
    const configMap = new Map<number, ModelConfig>()
    for (const id of configIds) {
      const config = await db.query.modelConfigs.findFirst({
        where: eq(modelConfigs.id, id),
      })
      if (config) configMap.set(id, config)
    }

    return taskList.map(task => ({
      ...task,
      modelConfig: configMap.get(task.modelConfigId),
    }))
  }

  // 提交任务（根据模型配置选择服务）
  async function submitTask(taskId: number): Promise<void> {
    const data = await getTaskWithConfig(taskId)
    if (!data) {
      throw new Error('任务或模型配置不存在')
    }

    const { task, config } = data

    // 更新状态为提交中
    await updateTask(taskId, { status: 'submitting' })

    // 根据任务的模型类型选择不同的处理方式
    if (task.modelType === 'gemini') {
      await submitToGemini(task, config)
    } else {
      await submitToMJ(task, config)
    }
  }

  // 提交到Gemini（同步API，立即返回结果）
  async function submitToGemini(task: Task, config: ModelConfig): Promise<void> {
    const gemini = createGeminiService(config.baseUrl, config.apiKey)

    try {
      const result = await gemini.generateImage(task.prompt ?? '')

      if (!result.success) {
        await updateTask(task.id, {
          status: 'failed',
          error: result.error || 'Gemini生成失败',
        })
        return
      }

      // Gemini直接返回base64图像，转换为data URL
      const imageUrl = `data:${result.mimeType};base64,${result.imageBase64}`

      await updateTask(task.id, {
        status: 'success',
        progress: '100%',
        imageUrl,
      })
    } catch (error: any) {
      await updateTask(task.id, {
        status: 'failed',
        error: error.message || 'Gemini生成失败',
      })
    }
  }

  // 提交到MJ API（异步执行）
  async function submitToMJ(task: Task, config: ModelConfig): Promise<void> {
    const mj = createMJService(config.baseUrl, config.apiKey)

    try {
      let result
      if (task.type === 'blend') {
        result = await mj.blend(task.images ?? [])
      } else {
        result = await mj.imagine(task.prompt ?? '', task.images ?? [])
      }

      if (result.code !== 1) {
        await updateTask(task.id, {
          status: 'failed',
          error: result.description || '提交到MJ失败',
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
        error: error.message || '提交到MJ失败',
      })
    }
  }

  // 同步任务状态（仅MJ需要轮询，Gemini是同步的）
  async function syncTaskStatus(taskId: number): Promise<Task | undefined> {
    const data = await getTaskWithConfig(taskId)
    if (!data) return undefined

    const { task, config } = data

    // Gemini任务是同步的，不需要轮询
    if (task.modelType === 'gemini') {
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

      return await updateTask(taskId, {
        status,
        progress: mjTask.progress || null,
        imageUrl: mjTask.imageUrl || null,
        error: mjTask.failReason || null,
        buttons: mjTask.buttons || null,
      })
    } catch (error: any) {
      // 查询失败不更新状态，仅记录错误
      console.error('同步任务状态失败:', error.message)
      return task
    }
  }

  // 执行按钮动作（创建新任务，仅MJ支持）
  async function executeAction(parentTaskId: number, customId: string, userId: number): Promise<Task> {
    const data = await getTaskWithConfig(parentTaskId)
    if (!data) {
      throw new Error('父任务不存在')
    }

    const { task: parentTask, config } = data

    if (parentTask.modelType !== 'midjourney') {
      throw new Error('仅Midjourney支持按钮动作')
    }

    if (!parentTask.upstreamTaskId) {
      throw new Error('父任务未提交')
    }

    // 创建新任务
    const [newTask] = await db.insert(tasks).values({
      userId,
      modelConfigId: parentTask.modelConfigId,
      modelType: parentTask.modelType,
      prompt: parentTask.prompt,
      images: parentTask.images,
      type: 'imagine',
      status: 'submitting',
    }).returning()

    const mj = createMJService(config.baseUrl, config.apiKey)

    try {
      const result = await mj.action(parentTask.upstreamTaskId, customId)

      if (result.code !== 1) {
        await updateTask(newTask.id, {
          status: 'failed',
          error: result.description || '执行动作失败',
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
        error: error.message || '执行动作失败',
      })
      return (await getTask(newTask.id))!
    }
  }

  return {
    createTask,
    updateTask,
    getTask,
    getTaskWithConfig,
    listTasks,
    submitTask,
    syncTaskStatus,
    executeAction,
  }
}

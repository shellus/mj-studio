/**
 * generate_video 工具实现
 */
import type { AuthUser, ModelParams } from '../../../../app/shared/types'
import { db } from '../../../database'
import { upstreams } from '../../../database/schema'
import { useTaskService } from '../../task'
import { useAimodelService } from '../../aimodel'
import { eq, and, isNull } from 'drizzle-orm'
import { waitForTask } from './wait-for-task'

const VIDEO_TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟

export async function generateVideo(
  user: AuthUser,
  aimodelId: number,
  prompt: string,
  images?: string[],
  modelParams?: Record<string, unknown>,
  blocking: boolean = true,
) {
  const aimodelService = useAimodelService()
  const taskService = useTaskService()

  // 获取模型配置
  const aimodel = await aimodelService.getById(aimodelId)
  if (!aimodel || aimodel.deletedAt) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '模型不存在' }) }],
      isError: true,
    }
  }

  // 验证是视频模型
  if (aimodel.category !== 'video') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '该模型不是视频生成模型' }) }],
      isError: true,
    }
  }

  // 验证上游属于用户
  const upstream = await db.query.upstreams.findFirst({
    where: and(
      eq(upstreams.id, aimodel.upstreamId),
      eq(upstreams.userId, user.id),
      isNull(upstreams.deletedAt),
    ),
  })

  if (!upstream) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '上游配置不存在或无权限' }) }],
      isError: true,
    }
  }

  // 创建任务
  const task = await taskService.createTask({
    userId: user.id,
    upstreamId: aimodel.upstreamId,
    aimodelId: aimodel.id,
    taskType: 'video',
    modelType: aimodel.modelType,
    apiFormat: aimodel.apiFormat,
    modelName: aimodel.modelName,
    prompt,
    modelParams: modelParams as ModelParams | undefined,
    images: images || [],
    type: 'imagine',
    isBlurred: false, // MCP 创建的任务默认不模糊
    sourceType: 'workbench',
  })

  // 异步提交任务
  taskService.submitTask(task.id).catch((err) => {
    console.error('MCP 异步提交视频任务失败:', err)
  })

  // 非阻塞模式：立即返回
  if (!blocking) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        taskId: task.id,
        status: 'pending',
        estimatedTime: aimodel.estimatedTime,
        message: `Task created. Please wait ${aimodel.estimatedTime} seconds before querying with get_task. Do NOT poll immediately.`,
      }) }],
    }
  }

  // 阻塞模式：等待任务完成
  const result = await waitForTask(task.id, user.id, VIDEO_TIMEOUT_MS)

  if (result.status === 'success') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        taskId: result.taskId,
        status: 'success',
        resourceUrl: result.resourceUrl,
      }) }],
    }
  }

  if (result.status === 'timeout') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        taskId: result.taskId,
        status: 'timeout',
        message: 'Task did not complete within 10 minutes. Use get_task to check status later.',
      }) }],
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      taskId: result.taskId,
      status: result.status,
      error: result.error,
    }) }],
    isError: result.status === 'error',
  }
}

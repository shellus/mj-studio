/**
 * generate_image 工具实现
 */
import type { AuthUser, ModelParams } from '../../../../app/shared/types'
import { db } from '../../../database'
import { upstreams } from '../../../database/schema'
import { useTaskService } from '../../task'
import { useAimodelService } from '../../aimodel'
import { eq, and, isNull } from 'drizzle-orm'

export async function generateImage(
  user: AuthUser,
  aimodelId: number,
  prompt: string,
  images?: string[],
  modelParams?: Record<string, unknown>,
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

  // 验证是图片模型
  if (aimodel.category !== 'image') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '该模型不是图片生成模型' }) }],
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
    taskType: 'image',
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
    console.error('MCP 异步提交图片任务失败:', err)
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      taskId: task.id,
      status: 'pending',
      estimatedTime: aimodel.estimatedTime,
      message: `Task created. Please wait ${aimodel.estimatedTime} seconds before querying with get_task. Do NOT poll immediately.`,
    }) }],
  }
}

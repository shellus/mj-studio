// 视频统一格式 API 服务封装
// 支持即梦和 Veo 视频生成，异步轮询模式

import { logRequest, logResponse } from './logger'
import type { VideoModelType } from '../../app/shared/types'

// 创建视频请求参数
interface VideoCreateParams {
  model: string
  prompt: string
  aspect_ratio?: string
  // 即梦特有
  size?: string  // 分辨率：720x1280, 1280x720, 1080P
  // Veo 特有
  enhance_prompt?: boolean
  enable_upsample?: boolean
  // 参考图（Base64 数组）
  images?: string[]
}

// 创建视频响应（内部统一格式）
interface VideoCreateResponse {
  id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  status_update_time?: number
}

// 查询任务响应（内部统一格式）
interface VideoQueryResponse {
  id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  progress?: number  // 进度百分比（0-100）
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string
}

// 即梦上游响应格式
interface JimengQueryResponse {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string
}

// Veo 上游响应格式
interface VeoQueryResponse {
  id: string
  status: 'pending' | 'generating' | 'success' | 'failed'
  progress?: number
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string
}

export type { VideoCreateParams, VideoCreateResponse, VideoQueryResponse }

// 根据模型类型判断是即梦还是 Veo
function isJimengModel(modelType: VideoModelType): boolean {
  return modelType === 'jimeng-video'
}

// 归一化即梦状态
function normalizeJimengStatus(status: JimengQueryResponse['status']): VideoQueryResponse['status'] {
  switch (status) {
    case 'completed':
      return 'success'
    default:
      return status
  }
}

// 归一化 Veo 状态
function normalizeVeoStatus(status: VeoQueryResponse['status']): VideoQueryResponse['status'] {
  switch (status) {
    case 'generating':
      return 'processing'
    default:
      return status
  }
}

// 工厂函数：根据配置创建视频统一服务实例
export function createVideoUnifiedService(baseUrl: string, apiKey: string, modelType: VideoModelType) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 创建视频任务
  async function create(
    params: VideoCreateParams,
    taskId?: number
  ): Promise<VideoCreateResponse> {
    const url = `${baseUrl}/v1/video/create`

    // 构建请求体，过滤掉 undefined 值
    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
    }

    if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio
    if (params.size) body.size = params.size
    if (params.enhance_prompt !== undefined) body.enhance_prompt = params.enhance_prompt
    if (params.enable_upsample !== undefined) body.enable_upsample = params.enable_upsample
    if (params.images && params.images.length > 0) body.images = params.images

    if (taskId) {
      logRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body,
      })
    }

    try {
      const response = await $fetch<VideoCreateResponse>(url, {
        method: 'POST',
        headers,
        body,
      })

      if (taskId) {
        logResponse(taskId, { status: 200, data: response })
      }

      return response
    } catch (error: any) {
      if (taskId) {
        logResponse(taskId, {
          status: error.status || error.statusCode,
          statusText: error.statusText || error.statusMessage,
          error: error.message,
          data: error.data,
        })
      }
      throw error
    }
  }

  // 查询任务状态
  async function query(upstreamTaskId: string, taskId?: number): Promise<VideoQueryResponse> {
    const url = `${baseUrl}/v1/video/query?id=${encodeURIComponent(upstreamTaskId)}`

    if (taskId) {
      logRequest(taskId, {
        url,
        method: 'GET',
        headers,
      })
    }

    try {
      // 根据模型类型解析不同的响应格式
      if (isJimengModel(modelType)) {
        const response = await $fetch<JimengQueryResponse>(url, {
          method: 'GET',
          headers,
        })

        if (taskId) {
          logResponse(taskId, { status: 200, data: response })
        }

        // 归一化为统一格式
        return {
          ...response,
          status: normalizeJimengStatus(response.status),
        }
      } else {
        // Veo
        const response = await $fetch<VeoQueryResponse>(url, {
          method: 'GET',
          headers,
        })

        if (taskId) {
          logResponse(taskId, { status: 200, data: response })
        }

        // 归一化为统一格式
        return {
          ...response,
          status: normalizeVeoStatus(response.status),
        }
      }
    } catch (error: any) {
      if (taskId) {
        logResponse(taskId, {
          status: error.status || error.statusCode,
          statusText: error.statusText || error.statusMessage,
          error: error.message,
          data: error.data,
        })
      }
      throw error
    }
  }

  return {
    create,
    query,
  }
}

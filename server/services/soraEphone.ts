/**
 * ephone Sora 视频 API 服务封装
 *
 * 对接 ephone 提供的 Sora 视频生成接口。
 * 采用异步轮询模式：创建任务后通过轮询查询状态直到完成。
 *
 * 端点：
 * - POST /v1/videos - 创建视频任务（multipart/form-data）
 * - GET /v1/videos/{video_id} - 查询任务状态
 *
 * 模型名称：sora_video2
 */

import { logTaskRequest, logTaskResponse } from '../utils/httpLogger'
import { extractFetchErrorInfo } from './errorClassifier'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 创建视频请求参数
 */
interface SoraEphoneCreateParams {
  /** 模型名称：sora-2 或 sora-2-pro */
  model: string
  /** 提示词 */
  prompt: string
  /** 视频时长：4, 8, 12 秒 */
  seconds?: number
  /** 分辨率：1080p, 720p, 480p */
  size?: string
  /** 参考图（URL 或 Base64） */
  inputReference?: string
  /** 回调 URL（可选） */
  callbackUrl?: string
}

/**
 * 创建视频响应
 */
interface SoraEphoneCreateResponse {
  id: string
  status: string
  progress?: number
  seconds?: number
  size?: string
}

/**
 * 查询任务响应（内部统一格式）
 */
interface SoraEphoneQueryResponse {
  id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  progress?: number
  video_url?: string
  error?: string
}

/**
 * 上游原始查询响应
 */
interface UpstreamQueryResponse {
  id: string
  status: string
  progress?: number
  video_url?: string
  error?: string | { code?: string; message?: string }
}

export type { SoraEphoneCreateParams, SoraEphoneCreateResponse, SoraEphoneQueryResponse }

// ============================================================================
// 状态归一化
// ============================================================================

/**
 * 上游状态 → 内部状态映射表
 */
const STATUS_NORMALIZATION: Record<string, SoraEphoneQueryResponse['status']> = {
  // 处理中状态
  'pending': 'processing',
  'processing': 'processing',
  'queued': 'processing',
  'generating': 'processing',
  'in_progress': 'processing',

  // 成功状态
  'success': 'success',
  'completed': 'success',

  // 失败状态
  'failed': 'failed',
  'error': 'failed',
}

/**
 * 归一化上游状态
 */
function normalizeStatus(upstreamStatus: string): SoraEphoneQueryResponse['status'] {
  const normalized = STATUS_NORMALIZATION[upstreamStatus.toLowerCase()]
  if (normalized) {
    return normalized
  }
  console.warn(`[SoraEphone] 未知上游状态: "${upstreamStatus}"，映射为 processing`)
  return 'processing'
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 创建 ephone Sora 视频服务实例
 */
export function createSoraEphoneService(baseUrl: string, apiKey: string) {
  /**
   * 创建视频任务
   *
   * 使用 multipart/form-data 格式提交
   */
  async function create(params: SoraEphoneCreateParams, taskId?: number): Promise<SoraEphoneCreateResponse> {
    const url = `${baseUrl}/v1/videos`

    // 构建 FormData
    const formData = new FormData()
    formData.append('model', params.model)
    formData.append('prompt', params.prompt)

    if (params.seconds) {
      formData.append('seconds', String(params.seconds))
    }
    if (params.size) {
      formData.append('size', params.size)
    }
    if (params.inputReference) {
      formData.append('input_reference', params.inputReference)
    }
    if (params.callbackUrl) {
      formData.append('callback_url', params.callbackUrl)
    }

    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers: { Authorization: 'Bearer ***' },
        body: {
          model: params.model,
          prompt: params.prompt,
          seconds: params.seconds,
          size: params.size,
          input_reference: params.inputReference ? '[IMAGE]' : undefined,
        },
      })
    }

    try {
      const response = await $fetch<SoraEphoneCreateResponse>(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // 不设置 Content-Type，让 fetch 自动设置 multipart/form-data 边界
        },
        body: formData,
      })

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      return response
    } catch (error: unknown) {
      if (taskId) {
        const errorInfo = extractFetchErrorInfo(error)
        logTaskResponse(taskId, {
          status: errorInfo.status,
          statusText: errorInfo.statusText,
          body: errorInfo.body,
          error: errorInfo.message,
          errorType: errorInfo.errorType,
          durationMs: Date.now() - startTime,
        })
      }
      throw error
    }
  }

  /**
   * 查询任务状态
   *
   * 使用路径参数 /v1/videos/{video_id}
   */
  async function query(upstreamTaskId: string, taskId?: number): Promise<SoraEphoneQueryResponse> {
    const url = `${baseUrl}/v1/videos/${encodeURIComponent(upstreamTaskId)}`

    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'GET',
        headers: { Authorization: 'Bearer ***' },
      })
    }

    try {
      const response = await $fetch<UpstreamQueryResponse>(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      // 归一化 error 字段
      const normalizedError = typeof response.error === 'object'
        ? response.error?.message || JSON.stringify(response.error)
        : response.error

      return {
        ...response,
        status: normalizeStatus(response.status),
        error: normalizedError,
      }
    } catch (error: unknown) {
      if (taskId) {
        const errorInfo = extractFetchErrorInfo(error)
        logTaskResponse(taskId, {
          status: errorInfo.status,
          statusText: errorInfo.statusText,
          body: errorInfo.body,
          error: errorInfo.message,
          errorType: errorInfo.errorType,
          durationMs: Date.now() - startTime,
        })
      }
      throw error
    }
  }

  return { create, query }
}

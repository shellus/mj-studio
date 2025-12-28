/**
 * 视频统一格式 API 服务封装
 *
 * 支持即梦和 Veo 视频生成，使用 OneAPI 定义的视频统一格式接口。
 * 采用异步轮询模式：创建任务后通过轮询查询状态直到完成。
 *
 * 端点：
 * - POST /v1/video/create - 创建视频任务
 * - GET /v1/video/query?id=xxx - 查询任务状态
 *
 * 状态归一化：
 * 不同上游返回的状态名称可能不同，本服务负责将所有上游状态
 * 归一化为内部标准状态（pending/processing/success/failed），
 * 确保上层代码和前端无需感知上游差异。
 */

import { logRequest, logResponse } from './logger'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 创建视频请求参数
 */
interface VideoCreateParams {
  model: string
  prompt: string
  aspect_ratio?: string
  size?: string            // 即梦: 分辨率 720x1280/1280x720/1080P
  enhance_prompt?: boolean // Veo: 提示词增强
  enable_upsample?: boolean // Veo: 超分辨率
  images?: string[]        // 参考图 Base64 数组
}

/**
 * 创建视频响应（内部统一格式）
 */
interface VideoCreateResponse {
  id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  status_update_time?: number
}

/**
 * 查询任务响应（内部统一格式）
 *
 * 这是服务层对外暴露的类型，status 字段已归一化为标准状态。
 * 上层代码（task.ts、前端）只需处理这四种状态。
 */
interface VideoQueryResponse {
  id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  progress?: number
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string
}

/**
 * 上游原始响应
 *
 * 不同上游返回的状态名称可能不同，status 使用 string 类型接收。
 * 归一化逻辑在 normalizeStatus 函数中处理。
 */
interface UpstreamQueryResponse {
  id: string
  status: string
  progress?: number
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string
}

export type { VideoCreateParams, VideoCreateResponse, VideoQueryResponse }

// ============================================================================
// 状态归一化
// ============================================================================

/**
 * 上游状态 → 内部状态映射表
 *
 * 所有上游可能返回的状态都应在此定义映射关系。
 * 新增上游或发现新状态时，只需在此添加映射即可。
 */
const STATUS_NORMALIZATION: Record<string, VideoQueryResponse['status']> = {
  // 处理中状态（任务已接收，尚未完成）
  'pending': 'processing',           // 排队等待
  'image_downloading': 'processing', // Veo: 下载参考图中
  'generating': 'processing',        // Veo: 生成中
  'video_generating': 'processing',  // Veo: 视频生成中
  'processing': 'processing',        // 标准处理中

  // 成功状态
  'success': 'success',
  'completed': 'success',            // 即梦/Veo: 完成

  // 失败状态
  'failed': 'failed',
}

/**
 * 归一化上游状态到内部状态
 *
 * 未知状态会记录警告日志并默认映射为 processing，
 * 避免脏数据写入数据库导致前端显示异常。
 */
function normalizeStatus(upstreamStatus: string): VideoQueryResponse['status'] {
  const normalized = STATUS_NORMALIZATION[upstreamStatus]
  if (normalized) {
    return normalized
  }
  console.warn(`[VideoUnified] 未知上游状态: "${upstreamStatus}"，映射为 processing`)
  return 'processing'
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 创建视频统一服务实例
 */
export function createVideoUnifiedService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  /**
   * 创建视频任务
   */
  async function create(params: VideoCreateParams, taskId?: number): Promise<VideoCreateResponse> {
    const url = `${baseUrl}/v1/video/create`

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
      logRequest(taskId, { url, method: 'POST', headers, body })
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

  /**
   * 查询任务状态
   *
   * 返回的 status 已归一化为内部标准状态。
   */
  async function query(upstreamTaskId: string, taskId?: number): Promise<VideoQueryResponse> {
    const url = `${baseUrl}/v1/video/query?id=${encodeURIComponent(upstreamTaskId)}`

    if (taskId) {
      logRequest(taskId, { url, method: 'GET', headers })
    }

    try {
      const response = await $fetch<UpstreamQueryResponse>(url, {
        method: 'GET',
        headers,
      })

      if (taskId) {
        logResponse(taskId, { status: 200, data: response })
      }

      return {
        ...response,
        status: normalizeStatus(response.status),
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

  return { create, query }
}

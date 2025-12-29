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
  size?: string            // 即梦/Sora: 分辨率
  enhance_prompt?: boolean // Veo: 提示词增强
  enable_upsample?: boolean // Veo: 超分辨率
  images?: string[]        // 参考图 Base64 数组
  // Sora 专用参数
  orientation?: 'portrait' | 'landscape'
  duration?: number
  watermark?: boolean
  private?: boolean
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
  error?: string | { code?: string; message?: string }
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
 *
 * 支持的视频模型：即梦、Veo、Sora、Grok Video
 * 参考：https://yunwu.apifox.cn/llms.txt
 */
const STATUS_NORMALIZATION: Record<string, VideoQueryResponse['status']> = {
  // ============ 处理中状态 ============
  // 通用状态
  'pending': 'processing',                    // 排队等待
  'processing': 'processing',                 // 标准处理中
  'generating': 'processing',                 // 生成中

  // Veo 特有状态
  'image_downloading': 'processing',          // 下载参考图中
  'video_generating': 'processing',           // 视频生成中
  'video_upsampling': 'processing',           // 超分处理中
  'video_generation_completed': 'processing', // 视频生成完成，等待后续处理（如超分）

  // 即梦官方格式状态（转为小写后匹配）
  'not_start': 'processing',                  // NOT_START
  'submitted': 'processing',                  // SUBMITTED
  'queued': 'processing',                     // QUEUED
  'in_progress': 'processing',                // IN_PROGRESS

  // ============ 成功状态 ============
  'success': 'success',
  'completed': 'success',                     // 即梦/Veo: 完成
  'video_upsampling_completed': 'success',    // Veo: 超分完成（最终成功）

  // ============ 失败状态 ============
  'failed': 'failed',
  'failure': 'failed',                        // 即梦官方格式: FAILURE
  'error': 'failed',                          // Veo: 错误
  'video_generation_failed': 'failed',        // Veo: 视频生成失败
  'video_upsampling_failed': 'failed',        // Veo: 超分失败
}

/**
 * 归一化上游状态到内部状态
 *
 * 支持大小写不敏感匹配（即梦官方格式使用大写状态如 IN_PROGRESS）。
 * 未知状态会记录警告日志并默认映射为 processing，
 * 避免脏数据写入数据库导致前端显示异常。
 */
function normalizeStatus(upstreamStatus: string): VideoQueryResponse['status'] {
  // 先尝试原始状态匹配
  let normalized = STATUS_NORMALIZATION[upstreamStatus]
  if (normalized) {
    return normalized
  }

  // 转为小写后再次尝试匹配（支持即梦大写状态）
  normalized = STATUS_NORMALIZATION[upstreamStatus.toLowerCase()]
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
    // Sora 专用参数
    if (params.orientation) body.orientation = params.orientation
    if (params.duration) body.duration = params.duration
    if (params.watermark !== undefined) body.watermark = params.watermark
    if (params.private !== undefined) body.private = params.private

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

      // 归一化 error 字段：上游可能返回对象 { code, message }，需要提取为字符串
      const normalizedError = typeof response.error === 'object'
        ? response.error?.message || JSON.stringify(response.error)
        : response.error

      return {
        ...response,
        status: normalizeStatus(response.status),
        error: normalizedError,
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

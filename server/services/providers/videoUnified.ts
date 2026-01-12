/**
 * 视频统一格式 API Provider
 *
 * 支持即梦、Veo、Sora、Grok Video 等视频生成。
 * 异步模式：提交 + 轮询
 * 端点：
 *   - 提交: POST /v1/video/create
 *   - 查询: GET /v1/video/query?id=xxx
 */

import type { AsyncProvider, AsyncSubmitResult, AsyncQueryResult, GenerateParams } from './types'
import type { VideoModelParams } from '../../../app/shared/types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { extractFetchErrorInfo } from '../errorClassifier'

interface VideoCreateResponse {
  id: string
  status: string
  status_update_time?: number
}

interface UpstreamQueryResponse {
  id: string
  status: string
  progress?: number
  video_url?: string
  enhanced_prompt?: string
  status_update_time?: number
  error?: string | { code?: string; message?: string }
}

// 状态归一化映射表
const STATUS_NORMALIZATION: Record<string, AsyncQueryResult['status']> = {
  // 处理中状态
  'pending': 'processing',
  'processing': 'processing',
  'generating': 'processing',
  'image_downloading': 'processing',
  'video_generating': 'processing',
  'video_upsampling': 'processing',
  'video_generation_completed': 'processing',
  'not_start': 'processing',
  'submitted': 'processing',
  'queued': 'processing',
  'in_progress': 'processing',
  // 成功状态
  'success': 'success',
  'completed': 'success',
  'video_upsampling_completed': 'success',
  // 失败状态
  'failed': 'failed',
  'failure': 'failed',
  'error': 'failed',
  'video_generation_failed': 'failed',
  'video_upsampling_failed': 'failed',
}

function normalizeStatus(upstreamStatus: string): AsyncQueryResult['status'] {
  let normalized = STATUS_NORMALIZATION[upstreamStatus]
  if (normalized) return normalized

  normalized = STATUS_NORMALIZATION[upstreamStatus.toLowerCase()]
  if (normalized) return normalized

  console.warn(`[VideoUnified] 未知上游状态: "${upstreamStatus}"，映射为 processing`)
  return 'processing'
}

export const videoUnifiedProvider: AsyncProvider = {
  meta: {
    apiFormat: 'video-unified',
    label: '视频统一格式',
    category: 'video',
    isAsync: true,
    supportedModelTypes: ['jimeng-video', 'veo', 'sora', 'grok-video'],
    capabilities: {
      referenceImage: true,
      duration: true,
      orientation: true,
      enhancePrompt: true,
      upsample: true,
    },
  },

  createService(baseUrl: string, apiKey: string) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    return {
      async submit(params: GenerateParams): Promise<AsyncSubmitResult> {
        const { taskId, prompt, images, modelName, modelParams } = params
        const url = `${baseUrl}/v1/video/create`
        const p = modelParams as VideoModelParams | undefined

        const body: Record<string, unknown> = {
          model: modelName,
          prompt,
        }

        if (p?.aspectRatio) body.aspect_ratio = p.aspectRatio
        if (p?.size) body.size = p.size
        if (p?.enhancePrompt !== undefined) body.enhance_prompt = p.enhancePrompt
        if (p?.upsample !== undefined) body.enable_upsample = p.upsample
        if (images && images.length > 0) body.images = images
        if (p?.orientation) body.orientation = p.orientation
        if (p?.duration) body.duration = p.duration
        if (p?.watermark !== undefined) body.watermark = p.watermark

        const startTime = Date.now()
        logTaskRequest(taskId, { url, method: 'POST', headers: { Authorization: 'Bearer ***' }, body })

        try {
          const response = await $fetch<VideoCreateResponse>(url, {
            method: 'POST',
            headers,
            body,
          })

          logTaskResponse(taskId, {
            status: 200,
            statusText: 'OK',
            body: response,
            durationMs: Date.now() - startTime,
          })

          return { upstreamTaskId: response.id }
        } catch (error: unknown) {
          const errorInfo = extractFetchErrorInfo(error)
          logTaskResponse(taskId, {
            status: errorInfo.status,
            statusText: errorInfo.statusText,
            body: errorInfo.body,
            error: errorInfo.message,
            errorType: errorInfo.errorType,
            durationMs: Date.now() - startTime,
          })
          throw error
        }
      },

      async query(upstreamTaskId: string, taskId?: number): Promise<AsyncQueryResult> {
        const url = `${baseUrl}/v1/video/query?id=${encodeURIComponent(upstreamTaskId)}`

        const startTime = Date.now()
        if (taskId) {
          logTaskRequest(taskId, { url, method: 'GET', headers: { Authorization: 'Bearer ***' } })
        }

        try {
          const response = await $fetch<UpstreamQueryResponse>(url, {
            method: 'GET',
            headers,
          })

          if (taskId) {
            logTaskResponse(taskId, {
              status: 200,
              statusText: 'OK',
              body: response,
              durationMs: Date.now() - startTime,
            })
          }

          const normalizedError = typeof response.error === 'object'
            ? response.error?.message || JSON.stringify(response.error)
            : response.error

          return {
            status: normalizeStatus(response.status),
            progress: response.progress,
            resourceUrl: response.video_url || undefined,
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
      },
    }
  },
}

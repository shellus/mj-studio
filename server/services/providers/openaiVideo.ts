/**
 * OpenAI Video API Provider
 *
 * 异步模式：提交 + 轮询
 * 端点：
 *   - 提交: POST /v1/videos (multipart/form-data)
 *   - 查询: GET /v1/videos/{video_id}
 *
 * 模型名称：sora-2, sora-2-pro
 */

import type { AsyncProvider, AsyncSubmitResult, AsyncQueryResult, GenerateParams } from './types'
import type { SoraVideoParams } from '../../../app/shared/types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { extractFetchErrorInfo } from '../errorClassifier'

interface OpenAIVideoCreateResponse {
  id: string
  status: string
  progress?: number
  seconds?: number
  size?: string
}

interface UpstreamQueryResponse {
  id: string
  status: string
  progress?: number
  video_url?: string
  error?: string | { code?: string; message?: string }
}

// 状态归一化映射表
const STATUS_NORMALIZATION: Record<string, AsyncQueryResult['status']> = {
  'pending': 'processing',
  'processing': 'processing',
  'queued': 'processing',
  'generating': 'processing',
  'in_progress': 'processing',
  'success': 'success',
  'completed': 'success',
  'failed': 'failed',
  'error': 'failed',
}

function normalizeStatus(upstreamStatus: string): AsyncQueryResult['status'] {
  const normalized = STATUS_NORMALIZATION[upstreamStatus.toLowerCase()]
  if (normalized) return normalized

  console.warn(`[OpenAIVideo] 未知上游状态: "${upstreamStatus}"，映射为 processing`)
  return 'processing'
}

export const openaiVideoProvider: AsyncProvider = {
  meta: {
    apiFormat: 'openai-video',
    label: 'OpenAI Video',
    category: 'video',
    isAsync: true,
    supportedModelTypes: ['sora'],
    capabilities: {
      referenceImage: true,
      duration: true,
      watermark: true,
    },
  },

  createService(baseUrl: string, apiKey: string) {
    return {
      async submit(params: GenerateParams): Promise<AsyncSubmitResult> {
        const { taskId, prompt, images, modelName, modelParams } = params
        const url = `${baseUrl}/v1/videos`

        // 参数映射
        const p = modelParams as SoraVideoParams | undefined

        // size 映射：根据 size + orientation 计算实际尺寸
        // API 支持: 720x1280, 1280x720, 1024x1792, 1792x1024
        let sizeValue: string | undefined
        if (p?.size) {
          const isPortrait = p.orientation === 'portrait'
          if (p.size === 'large') {
            sizeValue = isPortrait ? '1024x1792' : '1792x1024'
          } else {
            // small 或默认
            sizeValue = isPortrait ? '720x1280' : '1280x720'
          }
        }

        // 手动构建 multipart/form-data（Node.js FormData 有兼容性问题）
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)
        const textFields: Record<string, string> = {
          model: modelName,
          prompt,
        }
        if (p?.duration) textFields.seconds = String(p.duration)
        if (sizeValue) textFields.size = sizeValue

        const parts: Buffer[] = []
        for (const [key, value] of Object.entries(textFields)) {
          parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
          ))
        }

        // 参考图
        let hasInputReference = false
        if (images && images.length > 0) {
          const base64Data = images[0]!
          const matches = base64Data.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
          if (matches && matches[1] && matches[2]) {
            const mimeType = matches[1]
            const binaryData = Buffer.from(matches[2], 'base64')
            parts.push(Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="input_reference"; filename="reference.png"\r\nContent-Type: ${mimeType}\r\n\r\n`
            ))
            parts.push(binaryData)
            parts.push(Buffer.from('\r\n'))
            hasInputReference = true
          }
        }

        parts.push(Buffer.from(`--${boundary}--\r\n`))
        const body = Buffer.concat(parts)

        const startTime = Date.now()
        logTaskRequest(taskId, {
          url,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: {
            model: modelName,
            prompt,
            seconds: p?.duration,
            size: sizeValue,
            input_reference: hasInputReference ? '[BINARY]' : undefined,
          },
        })

        try {
          // 使用原生 fetch（$fetch 对 Buffer body 处理有问题）
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
          })

          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>
            const err = new Error((errorBody.message as string) || response.statusText)
            ;(err as any).status = response.status
            ;(err as any).statusText = response.statusText
            ;(err as any).data = errorBody
            throw err
          }

          const result = await response.json() as OpenAIVideoCreateResponse

          logTaskResponse(taskId, {
            status: 200,
            statusText: 'OK',
            body: result,
            durationMs: Date.now() - startTime,
          })

          return { upstreamTaskId: result.id }
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
        const url = `${baseUrl}/v1/videos/${encodeURIComponent(upstreamTaskId)}`

        const startTime = Date.now()
        if (taskId) {
          logTaskRequest(taskId, {
            url,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
          })
        }

        try {
          const response = await $fetch<UpstreamQueryResponse>(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
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

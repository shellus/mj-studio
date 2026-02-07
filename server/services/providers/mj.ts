/**
 * Midjourney API Provider (MJ-Proxy)
 *
 * 异步模式：提交 + 轮询
 * 端点：
 *   - 提交: POST /mj/submit/imagine 或 /mj/submit/blend
 *   - 查询: GET /mj/task/{taskId}/fetch
 *   - 动作: POST /mj/submit/action (U1-U4, V1-V4 等)
 *
 * 兼容多个 MJ 中转站
 */

import type { AsyncProvider, AsyncSubmitResult, AsyncQueryResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { extractFetchErrorInfo, classifyError } from '../errorClassifier'

interface MJSubmitResponse {
  code: number
  description: string
  result: string // task ID
  properties?: Record<string, unknown>
}

interface MJButton {
  customId: string
  emoji: string
  label: string
  style: number
  type: number
}

interface MJTaskResponse {
  id: string
  action: string
  prompt: string
  promptEn: string
  description: string
  status: 'NOT_START' | 'SUBMITTED' | 'MODAL' | 'IN_PROGRESS' | 'FAILURE' | 'SUCCESS'
  progress: string
  imageUrl: string
  failReason: string
  buttons: MJButton[]
  submitTime: number
  startTime: number
  finishTime: number
  properties?: Record<string, unknown>
}

export interface MJService {
  submit(params: GenerateParams): Promise<AsyncSubmitResult>
  query(upstreamTaskId: string, taskId?: number): Promise<AsyncQueryResult>
  /** MJ 特有：执行按钮动作 */
  action(parentUpstreamTaskId: string, customId: string, taskId?: number): Promise<AsyncSubmitResult>
}

export const mjProvider: AsyncProvider = {
  meta: {
    apiFormat: 'mj-proxy',
    label: 'MJ-Proxy',
    category: 'image',
    isAsync: true,
    supportedModelTypes: ['midjourney'],
    capabilities: {
      referenceImage: true,
    },
    validation: {
      supportsImageUrl: true,
    },
  },

  createService(baseUrl: string, apiKey: string): MJService {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    return {
      async submit(params: GenerateParams): Promise<AsyncSubmitResult> {
        const { taskId, prompt, images, type } = params
        const startTime = Date.now()

        // blend 模式
        if (type === 'blend' && images && images.length > 0) {
          const url = `${baseUrl}/mj/submit/blend`
          const body = { base64Array: images, dimensions: 'SQUARE' }

          logTaskRequest(taskId, { url, method: 'POST', headers, body })

          try {
            const response = await $fetch<MJSubmitResponse>(url, {
              method: 'POST',
              headers,
              body,
            })

            const result = typeof response === 'string' ? JSON.parse(response) : response

            logTaskResponse(taskId, {
              status: 200,
              statusText: 'OK',
              body: result,
              durationMs: Date.now() - startTime,
            })

            if (result.code !== 1) {
              throw new Error(result.description || '提交失败')
            }

            return { upstreamTaskId: result.result }
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
        }

        // imagine 模式（文生图/垫图）
        const url = `${baseUrl}/mj/submit/imagine`
        const body = { prompt, base64Array: images || [] }

        logTaskRequest(taskId, { url, method: 'POST', headers, body })

        try {
          const response = await $fetch<MJSubmitResponse>(url, {
            method: 'POST',
            headers,
            body,
          })

          const result = typeof response === 'string' ? JSON.parse(response) : response

          logTaskResponse(taskId, {
            status: 200,
            statusText: 'OK',
            body: result,
            durationMs: Date.now() - startTime,
          })

          if (result.code !== 1) {
            throw new Error(result.description || '提交失败')
          }

          return { upstreamTaskId: result.result }
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

      async query(upstreamTaskId: string): Promise<AsyncQueryResult> {
        const response = await $fetch<MJTaskResponse>(`${baseUrl}/mj/task/${upstreamTaskId}/fetch`, {
          method: 'GET',
          headers,
        })

        // 映射 MJ 状态到内部状态
        let status: AsyncQueryResult['status'] = 'processing'
        if (response.status === 'SUCCESS') {
          status = 'success'
        } else if (response.status === 'FAILURE') {
          status = 'failed'
        }

        // 解析进度百分比
        let progress: number | undefined
        if (response.progress) {
          const match = response.progress.match(/(\d+)%/)
          if (match) {
            progress = parseInt(match[1]!, 10)
          }
        }

        return {
          status,
          progress,
          resourceUrl: response.imageUrl || undefined,
          error: response.failReason ? classifyError({ message: response.failReason }) : undefined,
          buttons: response.buttons || undefined,
        }
      },

      async action(parentUpstreamTaskId: string, customId: string, taskId?: number): Promise<AsyncSubmitResult> {
        const url = `${baseUrl}/mj/submit/action`
        const body = { taskId: parentUpstreamTaskId, customId }
        const startTime = Date.now()

        if (taskId) {
          logTaskRequest(taskId, { url, method: 'POST', headers, body })
        }

        try {
          const response = await $fetch<MJSubmitResponse>(url, {
            method: 'POST',
            headers,
            body,
          })

          const result = typeof response === 'string' ? JSON.parse(response) : response

          if (taskId) {
            logTaskResponse(taskId, {
              status: 200,
              statusText: 'OK',
              body: result,
              durationMs: Date.now() - startTime,
            })
          }

          if (result.code !== 1) {
            throw new Error(result.description || '执行动作失败')
          }

          return { upstreamTaskId: result.result }
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

export type { MJButton }

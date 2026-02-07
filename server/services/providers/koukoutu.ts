/**
 * 抠抠图 API Provider
 *
 * 异步模式：提交 + 轮询
 * 端点：
 *   - 提交: POST /v1/create (multipart/form-data)
 *   - 查询: POST /v1/query (multipart/form-data)
 *
 * 只支持图生图（抠图），不支持文生图
 */

import type { AsyncProvider, AsyncSubmitResult, AsyncQueryResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { extractFetchErrorInfo } from '../errorClassifier'

interface KoukoutuCreateResponse {
  code: number
  message: string
  data: {
    task_id: number
  }
}

interface KoukoutuQueryResponse {
  code: number
  message: string
  data: {
    state: number  // 0: 处理中, 1: 成功, -1: 失败
    result_file?: string  // 结果图片 URL
  }
}

export const koukoutuProvider: AsyncProvider = {
  meta: {
    apiFormat: 'koukoutu',
    label: '抠抠图 API',
    category: 'image',
    isAsync: true,
    supportedModelTypes: ['koukoutu'],
    validation: {
      requiresPrompt: false,
      requiresImage: true,
      supportsImageUrl: false,
    },
  },

  createService(baseUrl: string, apiKey: string) {
    return {
      async submit(params: GenerateParams): Promise<AsyncSubmitResult> {
        const { taskId, images, modelName } = params

        if (!images || images.length === 0) {
          throw new Error('抠抠图需要上传图片')
        }

        const imageBase64 = images[0]!
        const modelKey = modelName || 'background-removal'
        const url = `${baseUrl}/v1/create`

        // 解析 base64 数据
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
        const binaryData = Buffer.from(base64Data, 'base64')

        // 构建 multipart/form-data
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)

        const textFields = {
          model_key: modelKey,
          output_format: 'webp',
          crop: '0',
          border: '0',
          stamp_crop: '0',
        }

        const parts: string[] = []
        for (const [key, value] of Object.entries(textFields)) {
          parts.push(`--${boundary}\r\n`)
          parts.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`)
          parts.push(`${value}\r\n`)
        }

        parts.push(`--${boundary}\r\n`)
        parts.push(`Content-Disposition: form-data; name="image_file"; filename="image.png"\r\n`)
        parts.push(`Content-Type: image/png\r\n\r\n`)

        const textPart = Buffer.from(parts.join(''), 'utf-8')
        const endPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
        const body = Buffer.concat([textPart, binaryData, endPart])

        const startTime = Date.now()
        logTaskRequest(taskId, {
          url,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: {
            model_key: modelKey,
            output_format: 'webp',
            image_file: `[base64 ${imageBase64.length} chars]`,
          },
        })

        try {
          const response = await $fetch<KoukoutuCreateResponse>(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
          })

          logTaskResponse(taskId, {
            status: 200,
            statusText: 'OK',
            body: response,
            durationMs: Date.now() - startTime,
          })

          if (response.code !== 200) {
            throw new Error(response.message || '提交失败')
          }

          return { upstreamTaskId: String(response.data.task_id) }
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
        const url = `${baseUrl}/v1/query`

        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)

        const parts = [
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="task_id"\r\n\r\n`,
          `${upstreamTaskId}\r\n`,
          `--${boundary}\r\n`,
          `Content-Disposition: form-data; name="response"\r\n\r\n`,
          `url\r\n`,
          `--${boundary}--\r\n`,
        ]

        const body = Buffer.from(parts.join(''), 'utf-8')

        const response = await $fetch<KoukoutuQueryResponse>(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        })

        // state: 0=处理中, 1=成功, -1=失败
        let status: AsyncQueryResult['status'] = 'processing'
        if (response.data.state === 1) {
          status = 'success'
        } else if (response.data.state === -1) {
          status = 'failed'
        }

        return {
          status,
          resourceUrl: response.data.result_file || undefined,
          error: status === 'failed' ? '抠图处理失败' : undefined,
        }
      },
    }
  },
}

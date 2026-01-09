// 抠抠图 API 服务封装
// 异步轮询模式，类似 MJ-Proxy

import { logTaskRequest, logTaskResponse } from '../utils/httpLogger'
import { extractFetchErrorInfo } from './errorClassifier'

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

export type { KoukoutuQueryResponse }

// 工厂函数：根据配置创建抠抠图服务实例
export function createKoukoutuService(baseUrl: string, apiKey: string) {
  // 创建抠图任务
  async function create(
    imageBase64: string,
    modelKey: string = 'background-removal',
    taskId?: number
  ): Promise<KoukoutuCreateResponse> {
    const url = `${baseUrl}/v1/create`

    // 解析 base64 数据
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const binaryData = Buffer.from(base64Data, 'base64')

    // 构建 multipart/form-data 边界
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)

    // 构建请求体
    const parts: string[] = []

    // 添加文本字段
    const textFields = {
      model_key: modelKey,
      output_format: 'webp',
      crop: '0',
      border: '0',
      stamp_crop: '0',
    }

    for (const [key, value] of Object.entries(textFields)) {
      parts.push(`--${boundary}\r\n`)
      parts.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`)
      parts.push(`${value}\r\n`)
    }

    // 添加文件字段
    parts.push(`--${boundary}\r\n`)
    parts.push(`Content-Disposition: form-data; name="image_file"; filename="image.png"\r\n`)
    parts.push(`Content-Type: image/png\r\n\r\n`)

    // 组合请求体
    const textPart = Buffer.from(parts.join(''), 'utf-8')
    const endPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    const body = Buffer.concat([textPart, binaryData, endPart])

    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers: { Authorization: '[REDACTED]' },
        body: {
          model_key: modelKey,
          output_format: 'webp',
          image_file: `[base64 ${imageBase64.length} chars]`,
        },
      })
    }

    try {
      const response = await $fetch<KoukoutuCreateResponse>(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
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

  // 查询任务状态
  async function query(upstreamTaskId: string): Promise<KoukoutuQueryResponse> {
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

    return response
  }

  return {
    create,
    query,
  }
}

// DALL-E Images API 格式服务
// 文生图: POST /v1/images/generations
// 垫图:
//   - 默认: POST /v1/images/generations (JSON, image 为纯 base64)
//   - 豆包: POST /v1/images/generations (JSON, image 为 data:image/...;base64,... 格式)
//   - Flux: POST /v1/images/edits (multipart/form-data, image 为文件)

import type { GenerateResult } from './types'
import { logRequest, logResponse } from './logger'
import { classifyFetchError, ERROR_MESSAGES } from './errorClassifier'
import { DEFAULT_MODEL_NAMES } from '../../app/shared/constants'

interface DalleResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
}

// 判断是否为豆包模型
function isDoubaoModel(modelName: string): boolean {
  return modelName.toLowerCase().includes('doubao')
}

// 判断是否为 Flux 模型
function isFluxModel(modelName: string): boolean {
  return modelName.toLowerCase().includes('flux')
}

// 将 base64 data URL 转换为 Blob
function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid data URL format')
  }
  const mimeType = match[1]
  const base64Data = match[2]
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

// 工厂函数：根据配置创建DALL-E服务实例
export function createDalleService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 文生图
  async function generateImage(prompt: string, modelName: string = DEFAULT_MODEL_NAMES.dalle, taskId?: number, signal?: AbortSignal): Promise<GenerateResult> {
    const url = `${baseUrl}/v1/images/generations`
    const body = {
      model: modelName,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }

    // 记录请求
    if (taskId) {
      logRequest(taskId, { url, method: 'POST', headers, body })
    }

    try {
      const response = await $fetch<DalleResponse>(url, {
        method: 'POST',
        headers,
        body,
        signal,
      })

      // 记录成功响应
      if (taskId) {
        logResponse(taskId, { status: 200, data: response })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        imageUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logResponse(taskId, {
          status: error.status || error.statusCode,
          statusText: error.statusText || error.statusMessage,
          error: error.message,
          data: error.data,
        })
      }

      return { success: false, error: classifyFetchError(error) }
    }
  }

  // 垫图
  async function generateImageWithRef(prompt: string, images: string[], modelName: string = DEFAULT_MODEL_NAMES.dalle, taskId?: number, signal?: AbortSignal): Promise<GenerateResult> {
    if (images.length === 0) {
      return generateImage(prompt, modelName, taskId, signal)
    }

    const imageDataUrl = images[0]

    // Flux 模型：使用 /v1/images/edits 端点和 multipart/form-data
    if (isFluxModel(modelName)) {
      return generateImageWithRefFlux(prompt, imageDataUrl, modelName, taskId, signal)
    }

    // 豆包和其他模型：使用 /v1/images/generations 端点和 JSON
    const url = `${baseUrl}/v1/images/generations`

    // 豆包需要完整的 data URL 格式，其他模型使用纯 base64
    let imageValue: string
    if (isDoubaoModel(modelName)) {
      // 豆包：保留完整的 data:image/...;base64,... 格式
      imageValue = imageDataUrl
    } else {
      // 其他模型：提取纯 base64
      const base64Match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/)
      imageValue = base64Match ? base64Match[1] : imageDataUrl
    }

    const body: Record<string, any> = {
      model: modelName,
      prompt,
      image: imageValue,
      n: 1,
      response_format: 'url',
    }

    // 豆包模型不发送 size 参数（部分上游不支持 adaptive）
    if (!isDoubaoModel(modelName)) {
      body.size = '1024x1024'
    }

    // 记录请求（图片数据截断）
    if (taskId) {
      logRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body: { ...body, image: `[${isDoubaoModel(modelName) ? 'dataUrl' : 'base64'} ${imageValue.length} chars]` },
      })
    }

    try {
      const response = await $fetch<DalleResponse>(url, {
        method: 'POST',
        headers,
        body,
        signal,
      })

      // 记录成功响应
      if (taskId) {
        logResponse(taskId, { status: 200, data: response })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        imageUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logResponse(taskId, {
          status: error.status || error.statusCode,
          statusText: error.statusText || error.statusMessage,
          error: error.message,
          data: error.data,
        })
      }

      return { success: false, error: classifyFetchError(error) }
    }
  }

  // Flux 专用垫图：使用 multipart/form-data
  async function generateImageWithRefFlux(prompt: string, imageDataUrl: string, modelName: string, taskId?: number, signal?: AbortSignal): Promise<GenerateResult> {
    const url = `${baseUrl}/v1/images/edits`

    // 构建 FormData
    const formData = new FormData()
    formData.append('model', modelName)
    formData.append('prompt', prompt)
    formData.append('n', '1')
    formData.append('response_format', 'b64_json')

    // 将 data URL 转换为 Blob 并添加到 FormData
    const blob = dataUrlToBlob(imageDataUrl)
    formData.append('image', blob, 'image.png')

    // 记录请求
    if (taskId) {
      logRequest(taskId, {
        url,
        method: 'POST',
        headers: { 'Authorization': '[REDACTED]' },
        body: { model: modelName, prompt, n: 1, response_format: 'b64_json', image: `[file ${blob.size} bytes]` },
      })
    }

    try {
      const response = await $fetch<DalleResponse>(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // 不设置 Content-Type，让浏览器自动设置 multipart/form-data
        },
        body: formData,
        signal,
      })

      // 记录成功响应
      if (taskId) {
        logResponse(taskId, { status: 200, data: response })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        imageUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logResponse(taskId, {
          status: error.status || error.statusCode,
          statusText: error.statusText || error.statusMessage,
          error: error.message,
          data: error.data,
        })
      }

      return { success: false, error: classifyFetchError(error) }
    }
  }

  return {
    generateImage,
    generateImageWithRef,
  }
}

// DALL-E Images API 格式服务
// 文生图: POST /v1/images/generations
// 垫图:
//   - 默认: POST /v1/images/generations (JSON, image 为纯 base64)
//   - 豆包: POST /v1/images/generations (JSON, image 为 data:image/...;base64,... 格式)
//   - Flux: POST /v1/images/edits (multipart/form-data, image 为文件)

import type { GenerateResult } from './types'
import type { ImageModelParams } from '../../app/shared/types'
import { logTaskRequest, logTaskResponse } from '../utils/httpLogger'
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
  if (!mimeType || !base64Data) {
    throw new Error('Invalid data URL format')
  }
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

  // 判断是否为 GPT Image 模型
  function isGptImageModel(modelName: string): boolean {
    return modelName.toLowerCase().includes('gpt-image')
  }

  // 文生图
  async function generateImage(prompt: string, modelName: string = DEFAULT_MODEL_NAMES.dalle, taskId?: number, signal?: AbortSignal, modelParams?: ImageModelParams): Promise<GenerateResult> {
    const url = `${baseUrl}/v1/images/generations`
    const body: Record<string, any> = {
      model: modelName,
      prompt,
      n: modelParams?.n || 1,
      response_format: 'url',
    }

    // 尺寸参数（豆包不发送 size）
    if (!isDoubaoModel(modelName)) {
      body.size = modelParams?.size || '1024x1024'
    } else if (modelParams?.size) {
      body.size = modelParams.size
    }

    // 负面提示词
    if (modelParams?.negativePrompt) {
      body.negative_prompt = modelParams.negativePrompt
    }

    // DALL-E 3 专属参数
    if (modelName.includes('dall-e-3')) {
      if (modelParams?.quality) body.quality = modelParams.quality
      if (modelParams?.style) body.style = modelParams.style
    }

    // 豆包专属参数
    if (isDoubaoModel(modelName)) {
      if (modelParams?.seed !== undefined && modelParams.seed !== -1) {
        body.seed = modelParams.seed
      }
      if (modelParams?.guidanceScale !== undefined) {
        body.guidance_scale = modelParams.guidanceScale
      }
      if (modelParams?.watermark !== undefined) {
        body.watermark = modelParams.watermark
      }
    }

    // Flux 专属参数
    if (isFluxModel(modelName)) {
      if (modelParams?.aspectRatio) body.aspect_ratio = modelParams.aspectRatio
    }

    // GPT Image 专属参数
    if (isGptImageModel(modelName)) {
      if (modelParams?.quality) body.quality = modelParams.quality
      if (modelParams?.background && modelParams.background !== 'auto') {
        body.background = modelParams.background
      }
    }

    // 记录请求
    const startTime = Date.now()
    if (taskId) {
      logTaskRequest(taskId, { url, method: 'POST', headers, body })
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
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        resourceUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
        })
      }

      return { success: false, error: classifyFetchError(error) }
    }
  }

  // 垫图
  async function generateImageWithRef(prompt: string, images: string[], modelName: string = DEFAULT_MODEL_NAMES.dalle, taskId?: number, signal?: AbortSignal, modelParams?: ImageModelParams): Promise<GenerateResult> {
    if (images.length === 0) {
      return generateImage(prompt, modelName, taskId, signal, modelParams)
    }

    const imageDataUrl = images[0]
    if (!imageDataUrl) {
      return generateImage(prompt, modelName, taskId, signal, modelParams)
    }

    // Flux 模型：使用 /v1/images/edits 端点和 multipart/form-data
    if (isFluxModel(modelName)) {
      return generateImageWithRefFlux(prompt, imageDataUrl, modelName, taskId, signal, modelParams)
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
      imageValue = base64Match?.[1] ?? imageDataUrl
    }

    const body: Record<string, any> = {
      model: modelName,
      prompt,
      image: imageValue,
      n: modelParams?.n || 1,
      response_format: 'url',
    }

    // 尺寸参数（豆包不发送 size）
    if (!isDoubaoModel(modelName)) {
      body.size = modelParams?.size || '1024x1024'
    } else if (modelParams?.size) {
      body.size = modelParams.size
    }

    // 负面提示词
    if (modelParams?.negativePrompt) {
      body.negative_prompt = modelParams.negativePrompt
    }

    // DALL-E 3 专属参数
    if (modelName.includes('dall-e-3')) {
      if (modelParams?.quality) body.quality = modelParams.quality
      if (modelParams?.style) body.style = modelParams.style
    }

    // 豆包专属参数
    if (isDoubaoModel(modelName)) {
      if (modelParams?.seed !== undefined && modelParams.seed !== -1) {
        body.seed = modelParams.seed
      }
      if (modelParams?.guidanceScale !== undefined) {
        body.guidance_scale = modelParams.guidanceScale
      }
      if (modelParams?.watermark !== undefined) {
        body.watermark = modelParams.watermark
      }
    }

    // GPT Image 专属参数（图生图模式不使用 Flux，因为 Flux 走单独的方法）
    if (isGptImageModel(modelName)) {
      if (modelParams?.quality) body.quality = modelParams.quality
      if (modelParams?.background && modelParams.background !== 'auto') {
        body.background = modelParams.background
      }
    }

    // 记录请求（图片数据截断）
    const startTime = Date.now()
    if (taskId) {
      logTaskRequest(taskId, {
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
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        resourceUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
        })
      }

      return { success: false, error: classifyFetchError(error) }
    }
  }

  // Flux 专用垫图：使用 multipart/form-data
  async function generateImageWithRefFlux(prompt: string, imageDataUrl: string, modelName: string, taskId?: number, signal?: AbortSignal, modelParams?: ImageModelParams): Promise<GenerateResult> {
    const url = `${baseUrl}/v1/images/edits`

    // 构建 FormData
    const formData = new FormData()
    formData.append('model', modelName)
    formData.append('prompt', prompt)
    formData.append('n', String(modelParams?.n || 1))
    formData.append('response_format', 'b64_json')

    // 负面提示词
    if (modelParams?.negativePrompt) {
      formData.append('negative_prompt', modelParams.negativePrompt)
    }

    // 宽高比
    if (modelParams?.aspectRatio) {
      formData.append('aspect_ratio', modelParams.aspectRatio)
    }

    // 将 data URL 转换为 Blob 并添加到 FormData
    const blob = dataUrlToBlob(imageDataUrl)
    formData.append('image', blob, 'image.png')

    // 记录请求
    const startTime = Date.now()
    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers: { 'Authorization': '[REDACTED]' },
        body: { model: modelName, prompt, negative_prompt: modelParams?.negativePrompt, n: 1, response_format: 'b64_json', image: `[file ${blob.size} bytes]` },
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
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      const imageData = response.data?.[0]
      if (!imageData) {
        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
      }

      return {
        success: true,
        resourceUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      // 记录错误响应
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
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

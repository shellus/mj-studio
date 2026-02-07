/**
 * DALL-E API Provider
 *
 * 同步模式：一次请求返回结果
 * 端点：
 *   - 文生图: POST /v1/images/generations
 *   - 垫图(Flux): POST /v1/images/edits (multipart/form-data)
 *   - 垫图(其他): POST /v1/images/generations (JSON)
 *
 * 支持模型：DALL-E 3, Flux, 豆包, GPT Image, Z-Image 等
 */

import type { SyncProvider, SyncResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { classifyFetchError, extractFetchErrorInfo, ERROR_MESSAGES } from '../errorClassifier'

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

// 判断是否为 GPT Image 模型
function isGptImageModel(modelName: string): boolean {
  return modelName.toLowerCase().includes('gpt-image')
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

export const dalleProvider: SyncProvider = {
  meta: {
    apiFormat: 'dalle',
    label: 'DALL-E API',
    category: 'image',
    isAsync: false,
    supportedModelTypes: ['dalle', 'flux', 'doubao', 'gpt-image', 'z-image'],
    capabilities: {
      referenceImage: true,
      negativePrompt: true,
      size: true,
      quality: true,
      style: true,
      aspectRatio: true,
      seed: true,
      guidance: true,
      watermark: true,
    },
    validation: {
      supportsImageUrl: true,
    },
  },

  createService(baseUrl: string, apiKey: string) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    // 文生图
    async function generateText2Image(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal } = params
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

      const startTime = Date.now()
      logTaskRequest(taskId, { url, method: 'POST', headers, body })

      try {
        const response = await $fetch<DalleResponse>(url, {
          method: 'POST',
          headers,
          body,
          signal,
        })

        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })

        const imageData = response.data?.[0]
        if (!imageData) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        return {
          success: true,
          resourceUrl: imageData.url,
          imageBase64: imageData.b64_json,
        }
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
        return { success: false, error: classifyFetchError(error) }
      }
    }

    // Flux 专用垫图：使用 multipart/form-data
    async function generateWithRefFlux(params: GenerateParams, imageDataUrl: string): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal } = params
      const url = `${baseUrl}/v1/images/edits`

      const formData = new FormData()
      formData.append('model', modelName)
      formData.append('prompt', prompt)
      formData.append('n', String(modelParams?.n || 1))
      formData.append('response_format', 'b64_json')

      if (modelParams?.negativePrompt) {
        formData.append('negative_prompt', modelParams.negativePrompt)
      }
      if (modelParams?.aspectRatio) {
        formData.append('aspect_ratio', modelParams.aspectRatio)
      }

      const blob = dataUrlToBlob(imageDataUrl)
      formData.append('image', blob, 'image.png')

      const startTime = Date.now()
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body: { model: modelName, prompt, n: 1, response_format: 'b64_json', image: `[file ${blob.size} bytes]` },
      })

      try {
        const response = await $fetch<DalleResponse>(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
          signal,
        })

        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })

        const imageData = response.data?.[0]
        if (!imageData) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        return {
          success: true,
          resourceUrl: imageData.url,
          imageBase64: imageData.b64_json,
        }
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
        return { success: false, error: classifyFetchError(error) }
      }
    }

    // 垫图（JSON 格式）
    async function generateWithRefJson(params: GenerateParams, imageDataUrl: string): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal } = params
      const url = `${baseUrl}/v1/images/generations`

      // 豆包需要完整的 data URL 格式，其他模型使用纯 base64
      let imageValue: string
      if (isDoubaoModel(modelName)) {
        imageValue = imageDataUrl
      } else {
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

      // 尺寸参数
      if (!isDoubaoModel(modelName)) {
        body.size = modelParams?.size || '1024x1024'
      } else if (modelParams?.size) {
        body.size = modelParams.size
      }

      if (modelParams?.negativePrompt) {
        body.negative_prompt = modelParams.negativePrompt
      }

      if (modelName.includes('dall-e-3')) {
        if (modelParams?.quality) body.quality = modelParams.quality
        if (modelParams?.style) body.style = modelParams.style
      }

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

      if (isGptImageModel(modelName)) {
        if (modelParams?.quality) body.quality = modelParams.quality
        if (modelParams?.background && modelParams.background !== 'auto') {
          body.background = modelParams.background
        }
      }

      const startTime = Date.now()
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body: { ...body, image: `[${isDoubaoModel(modelName) ? 'dataUrl' : 'base64'} ${imageValue.length} chars]` },
      })

      try {
        const response = await $fetch<DalleResponse>(url, {
          method: 'POST',
          headers,
          body,
          signal,
        })

        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })

        const imageData = response.data?.[0]
        if (!imageData) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        return {
          success: true,
          resourceUrl: imageData.url,
          imageBase64: imageData.b64_json,
        }
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
        return { success: false, error: classifyFetchError(error) }
      }
    }

    return {
      async generate(params: GenerateParams): Promise<SyncResult> {
        const { images, modelName } = params

        // 无参考图：文生图
        if (!images || images.length === 0) {
          return generateText2Image(params)
        }

        const imageDataUrl = images[0]
        if (!imageDataUrl) {
          return generateText2Image(params)
        }

        // Flux 模型：使用 multipart/form-data
        if (isFluxModel(modelName)) {
          return generateWithRefFlux(params, imageDataUrl)
        }

        // 其他模型：使用 JSON
        return generateWithRefJson(params, imageDataUrl)
      },
    }
  },
}

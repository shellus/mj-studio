/**
 * Gemini Image Generation Provider
 *
 * 同步模式：一次请求返回结果
 * 端点：POST /v1beta/models/{model}:generateContent
 *
 * 使用 Google Gemini 进行图像生成
 */

import type { SyncProvider, SyncResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { classifyFetchError, extractFetchErrorInfo, ERROR_MESSAGES } from '../errorClassifier'

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string // base64
        }
      }>
      role: string
    }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export const geminiProvider: SyncProvider = {
  meta: {
    apiFormat: 'gemini',
    label: 'Gemini API',
    category: 'image',
    isAsync: false,
    supportedModelTypes: ['gemini'],
    capabilities: {
      referenceImage: true,
    },
  },

  createService(baseUrl: string, apiKey: string) {
    // 文生图
    async function generateText2Image(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal } = params

      if (!apiKey) {
        return { success: false, error: 'Gemini API Key 未配置' }
      }

      const url = `${baseUrl}/v1beta/models/${modelName}:generateContent`
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
      }

      // 只在需要时设置 imageConfig，不设置 responseModalities
      if (modelParams?.size || modelParams?.aspectRatio) {
        body.generationConfig = {
          imageConfig: {
            ...(modelParams?.size ? { imageSize: modelParams.size } : {}),
            ...(modelParams?.aspectRatio ? { aspectRatio: modelParams.aspectRatio } : {}),
          },
        }
      }

      const startTime = Date.now()
      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      }

      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body,
      })

      try {
        const response = await $fetch<GeminiResponse>(url, {
          method: 'POST',
          headers,
          body,
          signal,
        })

        // 响应中的图片数据截断记录
        const logData = JSON.parse(JSON.stringify(response))
        logData.candidates?.forEach((c: { content?: { parts?: Array<{ inlineData?: { data?: string } }> } }) => {
          c.content?.parts?.forEach((p: { inlineData?: { data?: string } }) => {
            if (p.inlineData?.data) {
              p.inlineData.data = `[base64 ${p.inlineData.data.length} chars]`
            }
          })
        })
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: logData,
          durationMs: Date.now() - startTime,
        })

        const candidate = response.candidates?.[0]
        if (!candidate) {
          return { success: false, error: '未收到响应' }
        }

        const imagePart = candidate.content?.parts?.find(part => part.inlineData)
        if (imagePart?.inlineData) {
          return {
            success: true,
            imageBase64: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType,
          }
        }

        const textPart = candidate.content?.parts?.find(part => part.text)
        return { success: false, error: textPart?.text || ERROR_MESSAGES.EMPTY_RESPONSE }
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

    // 垫图（带参考图）
    async function generateWithRef(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, images, modelName, modelParams, signal } = params

      if (!apiKey) {
        return { success: false, error: 'Gemini API Key 未配置' }
      }

      if (!images || images.length === 0) {
        return generateText2Image(params)
      }

      const url = `${baseUrl}/v1beta/models/${modelName}:generateContent`

      // 构建 parts 数组，包含参考图和文本提示
      const parts: Array<{text?: string, inlineData?: {mimeType: string, data: string}}> = []

      for (const img of images) {
        const match = img.match(/^data:(image\/[^;]+);base64,(.+)$/)
        if (match) {
          const mimeType = match[1]
          const data = match[2]
          if (mimeType && data) {
            parts.push({ inlineData: { mimeType, data } })
          }
        }
      }
      parts.push({ text: prompt })

      const body: Record<string, unknown> = {
        contents: [{ parts }],
      }

      // 只在需要时设置 imageConfig，不设置 responseModalities
      if (modelParams?.size || modelParams?.aspectRatio) {
        body.generationConfig = {
          imageConfig: {
            ...(modelParams?.size ? { imageSize: modelParams.size } : {}),
            ...(modelParams?.aspectRatio ? { aspectRatio: modelParams.aspectRatio } : {}),
          },
        }
      }

      const startTime = Date.now()
      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      }

      // 请求中的图片数据截断记录
      const logBody = JSON.parse(JSON.stringify(body))
      logBody.contents?.[0]?.parts?.forEach((p: { inlineData?: { data?: string } }) => {
        if (p.inlineData?.data) {
          p.inlineData.data = `[base64 ${p.inlineData.data.length} chars]`
        }
      })
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body: logBody,
      })

      try {
        const response = await $fetch<GeminiResponse>(url, {
          method: 'POST',
          headers,
          body,
          signal,
        })

        const logData = JSON.parse(JSON.stringify(response))
        logData.candidates?.forEach((c: { content?: { parts?: Array<{ inlineData?: { data?: string } }> } }) => {
          c.content?.parts?.forEach((p: { inlineData?: { data?: string } }) => {
            if (p.inlineData?.data) {
              p.inlineData.data = `[base64 ${p.inlineData.data.length} chars]`
            }
          })
        })
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: logData,
          durationMs: Date.now() - startTime,
        })

        const candidate = response.candidates?.[0]
        if (!candidate) {
          return { success: false, error: '未收到响应' }
        }

        const imagePart = candidate.content?.parts?.find(part => part.inlineData)
        if (imagePart?.inlineData) {
          return {
            success: true,
            imageBase64: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType,
          }
        }

        const textPart = candidate.content?.parts?.find(part => part.text)
        return { success: false, error: textPart?.text || ERROR_MESSAGES.EMPTY_RESPONSE }
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
        if (params.images && params.images.length > 0) {
          return generateWithRef(params)
        }
        return generateText2Image(params)
      },
    }
  },
}

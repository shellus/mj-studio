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
    validation: {
      supportsImageUrl: true,
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
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 8192,
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          ...(modelParams?.size || modelParams?.aspectRatio ? {
            imageConfig: {
              ...(modelParams?.size ? { imageSize: modelParams.size } : {}),
              ...(modelParams?.aspectRatio ? { aspectRatio: modelParams.aspectRatio } : {}),
            },
          } : {}),
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
        ],
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

      // 注意：text 放在前面，inlineData 放在后面（按客服建议的顺序）
      const orderedParts: Array<{text?: string, inlineData?: {mimeType: string, data: string}}> = []
      orderedParts.push({ text: prompt })
      for (const img of images) {
        const match = img.match(/^data:(image\/[^;]+);base64,(.+)$/)
        if (match) {
          const mimeType = match[1]
          const data = match[2]
          if (mimeType && data) {
            orderedParts.push({ inlineData: { mimeType, data } })
          }
        }
      }

      const body: Record<string, unknown> = {
        contents: [{ role: 'user', parts: orderedParts }],
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 8192,
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          ...(modelParams?.size || modelParams?.aspectRatio ? {
            imageConfig: {
              ...(modelParams?.size ? { imageSize: modelParams.size } : {}),
              ...(modelParams?.aspectRatio ? { aspectRatio: modelParams.aspectRatio } : {}),
            },
          } : {}),
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
        ],
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

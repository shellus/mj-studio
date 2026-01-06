// OpenAI Chat Completions API 格式服务（用于图像生成）
// POST /v1/chat/completions
// 适用于: GPT-4o Image, Grok-4 等

import type { GenerateResult } from './types'
import { logTaskRequest, logTaskResponse } from '../utils/httpLogger'
import { classifyFetchError, ERROR_MESSAGES } from './errorClassifier'
import { DEFAULT_MODEL_NAMES } from '../../app/shared/constants'

interface OpenAIChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{
    type: 'text' | 'image_url'
    text?: string
    image_url?: {
      url: string
    }
  }>
}

interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// 从content中提取图片URL
function extractImageUrl(content: string): string | undefined {
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
  if (markdownMatch) return markdownMatch[1]

  const dataUrlMatch = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/)
  if (dataUrlMatch) return dataUrlMatch[1]

  const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp))/i)
  if (urlMatch) return urlMatch[1]

  return undefined
}

// 工厂函数：根据配置创建OpenAI Chat服务实例
export function createOpenAIChatService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 文生图
  async function generateImage(prompt: string, modelName: string = DEFAULT_MODEL_NAMES['gpt4o-image'], taskId?: number, signal?: AbortSignal): Promise<GenerateResult> {
    const url = `${baseUrl}/v1/chat/completions`
    const body = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }

    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, { url, method: 'POST', headers, body })
    }

    try {
      const response = await $fetch<OpenAIChatResponse>(url, {
        method: 'POST',
        headers,
        body,
        signal,
      })

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      const content = response.choices?.[0]?.message?.content || ''
      const imageUrl = extractImageUrl(content)

      if (!imageUrl) {
        return { success: false, error: ERROR_MESSAGES.PARSE_ERROR }
      }

      if (imageUrl.startsWith('data:image/')) {
        const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
        if (match) {
          return { success: true, imageBase64: match[2], mimeType: match[1] }
        }
      }

      return { success: true, resourceUrl: imageUrl }
    } catch (error: any) {
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

  // 垫图（带参考图）- 使用multimodal输入
  async function generateImageWithRef(prompt: string, images: string[], modelName: string = DEFAULT_MODEL_NAMES['gpt4o-image'], taskId?: number, signal?: AbortSignal): Promise<GenerateResult> {
    if (images.length === 0) {
      return generateImage(prompt, modelName, taskId, signal)
    }

    const url = `${baseUrl}/v1/chat/completions`

    // 构建multimodal消息
    const contentParts: Array<{type: 'text' | 'image_url', text?: string, image_url?: {url: string}}> = []

    for (const img of images) {
      contentParts.push({ type: 'image_url', image_url: { url: img } })
    }
    contentParts.push({ type: 'text', text: prompt })

    const body = {
      model: modelName,
      messages: [{ role: 'user', content: contentParts }],
      stream: false,
    }

    const startTime = Date.now()

    if (taskId) {
      // 请求中的图片数据截断记录
      const logBody = JSON.parse(JSON.stringify(body))
      logBody.messages?.[0]?.content?.forEach((p: any) => {
        if (p.image_url?.url?.startsWith('data:')) {
          p.image_url.url = `[base64 ${p.image_url.url.length} chars]`
        }
      })
      logTaskRequest(taskId, { url, method: 'POST', headers, body: logBody })
    }

    try {
      const response = await $fetch<OpenAIChatResponse>(url, {
        method: 'POST',
        headers,
        body,
        signal,
      })

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: response,
          durationMs: Date.now() - startTime,
        })
      }

      const content = response.choices?.[0]?.message?.content || ''
      const imageUrl = extractImageUrl(content)

      if (!imageUrl) {
        return { success: false, error: ERROR_MESSAGES.PARSE_ERROR }
      }

      if (imageUrl.startsWith('data:image/')) {
        const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
        if (match) {
          return { success: true, imageBase64: match[2], mimeType: match[1] }
        }
      }

      return { success: true, resourceUrl: imageUrl }
    } catch (error: any) {
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

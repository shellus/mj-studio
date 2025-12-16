// OpenAI Chat Completions API 格式服务（用于图像生成）
// POST /v1/chat/completions
// 适用于: GPT-4o Image, Grok-4 等

import type { GenerateResult } from './types'

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
// 支持多种格式：markdown ![](url)、纯URL、base64 data URL
function extractImageUrl(content: string): string | undefined {
  // 匹配 markdown 图片格式 ![...](url)
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
  if (markdownMatch) {
    return markdownMatch[1]
  }

  // 匹配 data URL (base64)
  const dataUrlMatch = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/)
  if (dataUrlMatch) {
    return dataUrlMatch[1]
  }

  // 匹配纯URL
  const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp))/i)
  if (urlMatch) {
    return urlMatch[1]
  }

  return undefined
}

// 工厂函数：根据配置创建OpenAI Chat服务实例
export function createOpenAIChatService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 文生图
  async function generateImage(prompt: string, modelName: string = 'gpt-4o-image'): Promise<GenerateResult> {
    try {
      console.log('[OpenAI Chat] 请求URL:', `${baseUrl}/v1/chat/completions`)
      console.log('[OpenAI Chat] 模型:', modelName)

      const response = await $fetch<OpenAIChatResponse>(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: false,
        },
      })

      console.log('[OpenAI Chat] 响应:', JSON.stringify(response, null, 2).slice(0, 1000))

      const content = response.choices?.[0]?.message?.content || ''
      const imageUrl = extractImageUrl(content)

      if (!imageUrl) {
        return {
          success: false,
          error: '未能从响应中提取图片: ' + content.slice(0, 200),
        }
      }

      // 判断是否为base64
      if (imageUrl.startsWith('data:image/')) {
        const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
        if (match) {
          return {
            success: true,
            imageBase64: match[2],
            mimeType: match[1],
          }
        }
      }

      return {
        success: true,
        imageUrl,
      }
    } catch (error: any) {
      console.error('[OpenAI Chat] API错误:', error)
      const errorMessage = error.data?.error?.message || error.message || '调用OpenAI Chat API失败'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  // 垫图（带参考图）- 使用multimodal输入
  async function generateImageWithRef(prompt: string, images: string[], modelName: string = 'gpt-4o-image'): Promise<GenerateResult> {
    if (images.length === 0) {
      return generateImage(prompt, modelName)
    }

    try {
      console.log('[OpenAI Chat] 垫图请求，参考图数量:', images.length)

      // 构建multimodal消息
      const contentParts: Array<{type: 'text' | 'image_url', text?: string, image_url?: {url: string}}> = []

      // 添加参考图
      for (const img of images) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: img, // 支持base64 data URL或http URL
          },
        })
      }

      // 添加文本提示
      contentParts.push({
        type: 'text',
        text: prompt,
      })

      const response = await $fetch<OpenAIChatResponse>(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: contentParts,
            },
          ],
          stream: false,
        },
      })

      const content = response.choices?.[0]?.message?.content || ''
      const imageUrl = extractImageUrl(content)

      if (!imageUrl) {
        return {
          success: false,
          error: '未能从响应中提取图片: ' + content.slice(0, 200),
        }
      }

      // 判断是否为base64
      if (imageUrl.startsWith('data:image/')) {
        const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
        if (match) {
          return {
            success: true,
            imageBase64: match[2],
            mimeType: match[1],
          }
        }
      }

      return {
        success: true,
        imageUrl,
      }
    } catch (error: any) {
      console.error('[OpenAI Chat] 垫图API错误:', error)
      const errorMessage = error.data?.error?.message || error.message || '垫图失败'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  return {
    generateImage,
    generateImageWithRef,
  }
}

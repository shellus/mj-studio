// DALL-E Images API 格式服务
// 文生图: POST /v1/images/generations
// 垫图:   POST /v1/images/edits (需中转站支持)

import type { GenerateResult } from './types'

interface DalleResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
}

// 工厂函数：根据配置创建DALL-E服务实例
export function createDalleService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 文生图
  async function generateImage(prompt: string, modelName: string = 'dall-e-3'): Promise<GenerateResult> {
    try {
      console.log('[DALL-E] 请求URL:', `${baseUrl}/v1/images/generations`)
      console.log('[DALL-E] 模型:', modelName)

      const response = await $fetch<DalleResponse>(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers,
        body: {
          model: modelName,
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'url',
        },
      })

      console.log('[DALL-E] 响应:', JSON.stringify(response, null, 2).slice(0, 500))

      const imageData = response.data?.[0]
      if (!imageData) {
        return {
          success: false,
          error: '未收到图片数据',
        }
      }

      return {
        success: true,
        imageUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      console.error('[DALL-E] API错误:', error)
      const errorMessage = error.data?.error?.message || error.message || '调用DALL-E API失败'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  // 垫图 - 使用 /v1/images/generations 接口传递 image 参数
  // 大多数中转站支持在 generations 接口中通过 image 参数传递参考图
  async function generateImageWithRef(prompt: string, images: string[], modelName: string = 'dall-e-3'): Promise<GenerateResult> {
    if (images.length === 0) {
      return generateImage(prompt, modelName)
    }

    try {
      console.log('[DALL-E] 垫图请求URL:', `${baseUrl}/v1/images/generations`)
      console.log('[DALL-E] 模型:', modelName)
      console.log('[DALL-E] 参考图数量:', images.length)

      // 取第一张参考图，提取 base64 数据
      const imageDataUrl = images[0]
      const base64Match = imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/)
      const imageBase64 = base64Match ? base64Match[1] : imageDataUrl

      const response = await $fetch<DalleResponse>(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers,
        body: {
          model: modelName,
          prompt,
          image: imageBase64, // 参考图 base64
          n: 1,
          size: '1024x1024',
          response_format: 'url',
        },
      })

      console.log('[DALL-E] 垫图响应:', JSON.stringify(response, null, 2).slice(0, 500))

      const imageData = response.data?.[0]
      if (!imageData) {
        return {
          success: false,
          error: '未收到图片数据',
        }
      }

      return {
        success: true,
        imageUrl: imageData.url,
        imageBase64: imageData.b64_json,
      }
    } catch (error: any) {
      console.error('[DALL-E] 垫图API错误:', error)
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

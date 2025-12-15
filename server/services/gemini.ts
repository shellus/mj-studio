// Gemini Image Generation 服务封装
// 使用 Google Gemini 2.0 Flash 进行图像生成

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

interface GeminiGenerateResult {
  success: boolean
  imageBase64?: string
  mimeType?: string
  error?: string
}

// 工厂函数：根据配置创建Gemini服务实例
export function createGeminiService(baseUrl: string, apiKey: string) {
  // baseUrl应该是 https://generativelanguage.googleapis.com/v1beta 或兼容的代理
  const model = 'gemini-2.5-flash-image' // 支持图像生成的模型

  // 生成图像
  async function generateImage(prompt: string): Promise<GeminiGenerateResult> {
    if (!apiKey) {
      return {
        success: false,
        error: 'Gemini API Key 未配置',
      }
    }

    try {
      const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`
      console.log('[Gemini] 请求URL:', url.replace(apiKey, '***'))

      const response = await $fetch<GeminiResponse>(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['Text', 'Image'],
            },
          },
        }
      )

      console.log('[Gemini] 响应:', JSON.stringify(response, null, 2).slice(0, 1000))

      // 解析响应，查找图像数据
      const candidate = response.candidates?.[0]
      if (!candidate) {
        return {
          success: false,
          error: '未收到响应',
        }
      }

      // 查找图像部分
      const imagePart = candidate.content?.parts?.find(part => part.inlineData)
      if (imagePart?.inlineData) {
        return {
          success: true,
          imageBase64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType,
        }
      }

      // 如果没有图像，返回文本（可能是错误信息）
      const textPart = candidate.content?.parts?.find(part => part.text)
      return {
        success: false,
        error: textPart?.text || '未生成图像',
      }
    } catch (error: any) {
      // 处理API错误
      console.error('[Gemini] API错误:', error)
      console.error('[Gemini] 错误详情:', JSON.stringify(error.data || error.response || {}, null, 2))
      const errorMessage = error.data?.error?.message || error.message || '调用Gemini API失败'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  return {
    generateImage,
  }
}

export type { GeminiGenerateResult }

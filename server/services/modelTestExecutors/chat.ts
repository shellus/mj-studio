/**
 * 对话模型测试执行器
 *
 * 复用现有 chatProviders 实现对话模型测试
 */
import type { Upstream, Aimodel } from '../../database/schema'
import { getChatProvider, type ChatApiFormat } from '../chatProviders'
import type { TestExecuteResult } from './index'

/**
 * 测试对话模型
 */
export async function testChatModel(
  upstream: Upstream,
  aimodel: Aimodel,
  prompt: string,
  timeout: number,
  keywords?: string[]
): Promise<TestExecuteResult> {
  const startTime = Date.now()

  try {
    // 获取 chat provider
    const provider = getChatProvider(aimodel.apiFormat as ChatApiFormat)
    if (!provider) {
      return {
        status: 'failed',
        responseTime: Date.now() - startTime,
        errorMessage: `不支持的 API 格式: ${aimodel.apiFormat}`,
      }
    }

    // 创建服务实例
    const service = provider.createService(upstream, aimodel.keyName)

    // 创建超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

    try {
      // 调用非流式 chat 方法
      const result = await service.chat(
        aimodel.modelName,
        null, // systemPrompt
        [],   // historyMessages
        prompt,
        undefined, // userFiles
        controller.signal
      )

      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      if (!result.success) {
        return {
          status: 'failed',
          responseTime,
          errorMessage: result.error || '请求失败',
        }
      }

      const content = result.content || ''

      // 关键词验证
      if (keywords && keywords.length > 0) {
        const hasKeyword = keywords.some(kw =>
          content.toLowerCase().includes(kw.toLowerCase())
        )
        if (!hasKeyword) {
          return {
            status: 'failed',
            responseTime,
            responsePreview: content.slice(0, 200),
            errorMessage: `响应未包含期望的关键词: ${keywords.join(', ')}`,
          }
        }
      }

      return {
        status: 'success',
        responseTime,
        responsePreview: content.slice(0, 200),
      }
    } catch (err) {
      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      // 检测超时/取消错误
      if (err instanceof Error) {
        const isAbort = err.name === 'AbortError'
          || err.name === 'TimeoutError'
          || err.message.includes('aborted')
          || err.message.includes('cancelled')
          || err.message.includes('canceled')
          || err.message.includes('timeout')
        if (isAbort) {
          return {
            status: 'failed',
            responseTime,
            errorMessage: `请求超时 (${timeout}s)`,
          }
        }
      }

      throw err
    }
  } catch (err) {
    const responseTime = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    return {
      status: 'failed',
      responseTime,
      errorMessage,
    }
  }
}

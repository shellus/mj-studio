/**
 * 绘图/视频模型测试执行器
 *
 * 复用现有 providers 实现绘图和视频模型测试
 */
import type { Upstream, Aimodel } from '../../database/schema'
import { getProvider, isAsyncProvider, isSyncProvider, type ApiFormat } from '../providers'
import { useUpstreamService } from '../upstream'
import type { TestExecuteResult } from './index'

/**
 * 测试同步绘图模型（DALL-E、Gemini 等）
 */
export async function testSyncImageModel(
  upstream: Upstream,
  aimodel: Aimodel,
  prompt: string,
  timeout: number
): Promise<TestExecuteResult> {
  const startTime = Date.now()

  try {
    const provider = getProvider(aimodel.apiFormat as ApiFormat)
    if (!provider) {
      return {
        status: 'failed',
        responseTime: Date.now() - startTime,
        errorMessage: `不支持的 API 格式: ${aimodel.apiFormat}`,
      }
    }

    if (!isSyncProvider(provider)) {
      return {
        status: 'failed',
        responseTime: Date.now() - startTime,
        errorMessage: `该 API 格式不是同步模式: ${aimodel.apiFormat}`,
      }
    }

    // 获取 API Key
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, aimodel.keyName)

    // 创建服务实例
    const service = provider.createService(upstream.baseUrl, apiKey)

    // 创建超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

    try {
      const result = await service.generate({
        taskId: 0, // 测试任务不需要真实 taskId
        prompt,
        modelName: aimodel.modelName,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      if (!result.success) {
        return {
          status: 'failed',
          responseTime,
          errorMessage: result.error || '生成失败',
        }
      }

      return {
        status: 'success',
        responseTime,
        responsePreview: result.resourceUrl || '[Base64 图片]',
      }
    } catch (err) {
      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      if (err instanceof Error && err.name === 'AbortError') {
        return {
          status: 'failed',
          responseTime,
          errorMessage: `请求超时 (${timeout}s)`,
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

/**
 * 测试异步模型（MJ、视频等）
 * 提交任务后轮询直到完成或超时
 */
export async function testAsyncModel(
  upstream: Upstream,
  aimodel: Aimodel,
  prompt: string,
  timeout: number
): Promise<TestExecuteResult> {
  const startTime = Date.now()

  try {
    const provider = getProvider(aimodel.apiFormat as ApiFormat)
    if (!provider) {
      return {
        status: 'failed',
        responseTime: Date.now() - startTime,
        errorMessage: `不支持的 API 格式: ${aimodel.apiFormat}`,
      }
    }

    if (!isAsyncProvider(provider)) {
      return {
        status: 'failed',
        responseTime: Date.now() - startTime,
        errorMessage: `该 API 格式不是异步模式: ${aimodel.apiFormat}`,
      }
    }

    // 获取 API Key
    const upstreamService = useUpstreamService()
    const apiKey = upstreamService.getApiKey(upstream, aimodel.keyName)

    // 创建服务实例
    const service = provider.createService(upstream.baseUrl, apiKey)

    // 1. 提交任务
    const submitResult = await service.submit({
      taskId: 0,
      prompt,
      modelName: aimodel.modelName,
    })

    const upstreamTaskId = submitResult.upstreamTaskId

    // 2. 轮询查询结果
    const pollInterval = 3000 // 3秒轮询一次
    const maxTime = timeout * 1000

    while (Date.now() - startTime < maxTime) {
      const queryResult = await service.query(upstreamTaskId)

      if (queryResult.status === 'success') {
        return {
          status: 'success',
          responseTime: Date.now() - startTime,
          responsePreview: queryResult.resourceUrl || '[生成完成]',
        }
      }

      if (queryResult.status === 'failed') {
        return {
          status: 'failed',
          responseTime: Date.now() - startTime,
          errorMessage: queryResult.error || '任务失败',
        }
      }

      // 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    // 超时
    return {
      status: 'failed',
      responseTime: Date.now() - startTime,
      errorMessage: `任务超时 (${timeout}s)`,
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

/**
 * 测试绘图/视频模型（自动判断同步/异步）
 */
export async function testMediaModel(
  upstream: Upstream,
  aimodel: Aimodel,
  prompt: string,
  timeout: number
): Promise<TestExecuteResult> {
  const provider = getProvider(aimodel.apiFormat as ApiFormat)

  if (!provider) {
    return {
      status: 'failed',
      responseTime: 0,
      errorMessage: `不支持的 API 格式: ${aimodel.apiFormat}`,
    }
  }

  if (isAsyncProvider(provider)) {
    return testAsyncModel(upstream, aimodel, prompt, timeout)
  } else {
    return testSyncImageModel(upstream, aimodel, prompt, timeout)
  }
}

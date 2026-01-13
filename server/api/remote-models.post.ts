/**
 * POST /api/remote-models
 * 获取上游的远程模型列表
 */
import { inferModelInfo } from '~/shared/model-inference'
import type { ModelCategory, ModelCapability, ApiFormat, ModelType } from '~/shared/types'

interface RemoteModel {
  id: string
  name: string
  group: string
  category: ModelCategory
  capabilities: ModelCapability[]
  apiFormat: ApiFormat
  modelType: ModelType
}

interface UpstreamModelResponse {
  data: Array<{
    id: string
    object?: string
    created?: number
    owned_by?: string
  }>
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ baseUrl: string; apiKey: string }>(event)

  if (!body.baseUrl || !body.apiKey) {
    throw createError({
      statusCode: 400,
      message: '缺少 baseUrl 或 apiKey',
    })
  }

  // 构建请求 URL
  let url = body.baseUrl.replace(/\/$/, '')
  if (!url.endsWith('/v1/models')) {
    url = `${url}/v1/models`
  }

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${body.apiKey}`,
      },
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: `上游请求失败: ${response.statusText}`,
      })
    }

    const data = (await response.json()) as UpstreamModelResponse

    if (!data.data || !Array.isArray(data.data)) {
      throw createError({
        statusCode: 500,
        message: '上游返回格式错误',
      })
    }

    // 推断并转换模型信息
    const models: RemoteModel[] = data.data.map((model) => {
      const info = inferModelInfo(model.id)
      return {
        id: model.id,
        name: model.id,
        group: info.group,
        category: info.category,
        capabilities: info.capabilities,
        apiFormat: info.apiFormat,
        modelType: info.modelType,
      }
    })

    return { models }
  }
  catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw err
    }
    throw createError({
      statusCode: 500,
      message: `请求上游失败: ${err instanceof Error ? err.message : '未知错误'}`,
    })
  }
})

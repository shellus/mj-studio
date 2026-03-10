/**
 * POST /api/external/video - 生成视频
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { generateVideo } from '../../services/mcp/tools/generate-video'
import { unwrapMcpResult } from '../../utils/external-api'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)
    const body = await readBody(event)

    const {
      aimodelId,
      prompt,
      images,
      modelParams,
      blocking = true,
    } = body as {
      aimodelId: number
      prompt: string
      images?: string[]
      modelParams?: Record<string, unknown>
      blocking?: boolean
    }

    if (!aimodelId || !prompt?.trim()) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '缺少必填参数 aimodelId 或 prompt' }
    }

    const mcpResult = await generateVideo(
      user,
      aimodelId,
      prompt,
      images,
      modelParams,
      blocking,
    )

    const { data, isError } = unwrapMcpResult(mcpResult)

    if (isError) {
      setResponseStatus(event, 400)
      return { status: 'error', error: data.error }
    }

    return { status: 'ok', data }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const err = error as { statusCode: number; message: string }
      setResponseStatus(event, err.statusCode)
      return { status: 'error', error: err.message }
    }
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    setResponseStatus(event, 500)
    return { status: 'error', error: errorMsg }
  }
})

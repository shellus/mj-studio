/**
 * GET /api/external/models - 列出用户模型
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { listModels } from '../../services/mcp/tools/list-models'
import { unwrapMcpResult } from '../../utils/external-api'
import type { ModelCategory } from '../../../app/shared/types'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)
    const { category } = getQuery(event) as { category?: string }

    const mcpResult = await listModels(user, category as ModelCategory)
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

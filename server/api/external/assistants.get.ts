/**
 * GET /api/external/assistants - 列出用户助手
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { listAssistants } from '../../services/mcp/tools/list-assistants'
import { unwrapMcpResult } from '../../utils/external-api'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)

    const mcpResult = await listAssistants(user)
    const { data } = unwrapMcpResult(mcpResult)

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

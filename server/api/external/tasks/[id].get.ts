/**
 * GET /api/external/tasks/[id] - 查看任务详情
 */
import { requireApiKeyAuth } from '../../../utils/jwt'
import { getTask } from '../../../services/mcp/tools/get-task'
import { unwrapMcpResult } from '../../../utils/external-api'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)
    const id = Number(getRouterParam(event, 'id'))

    if (!id || isNaN(id)) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '无效的任务 ID' }
    }

    const mcpResult = await getTask(user, id)
    const { data, isError } = unwrapMcpResult(mcpResult)

    if (isError) {
      setResponseStatus(event, 404)
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

/**
 * GET /api/external/tasks - 列出任务
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { listTasks } from '../../services/mcp/tools/list-tasks'
import { unwrapMcpResult } from '../../utils/external-api'
import type { TaskType, TaskStatus } from '../../../app/shared/types'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireApiKeyAuth(event)
    const query = getQuery(event) as {
      type?: string
      status?: string
      limit?: string
    }

    const taskType = query.type as TaskType | undefined
    const status = query.status as TaskStatus | undefined
    const limit = query.limit ? Number(query.limit) : undefined

    const mcpResult = await listTasks(user, taskType, status, limit)
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

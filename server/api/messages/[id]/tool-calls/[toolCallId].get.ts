/**
 * GET /api/messages/[id]/tool-calls/[toolCallId]
 * 查询工具调用状态
 *
 * 查询逻辑：
 * 1. 先查内存状态（toolCallState）
 * 2. 若无，查数据库（通过 toolCallData 和后续 tool 消息推断）
 */
import { useConversationService } from '../../../../services/conversation'
import { getToolCallState, isToolCallPending } from '../../../../services/toolCallState'
import type { ToolCallEventStatus } from '../../../../../app/shared/events'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const toolCallId = getRouterParam(event, 'toolCallId')

  if (!id || !toolCallId) {
    throw createError({ statusCode: 400, message: '参数不完整' })
  }

  const messageId = parseInt(id, 10)
  if (isNaN(messageId)) {
    throw createError({ statusCode: 400, message: '无效的消息ID' })
  }

  // 获取消息并验证权限
  const conversationService = useConversationService()
  const message = await conversationService.getMessageById(messageId)

  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  const conversation = await conversationService.getById(message.conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此消息' })
  }

  // 1. 先查内存状态
  const memoryState = getToolCallState(messageId, toolCallId)
  if (memoryState) {
    return {
      messageId: memoryState.messageId,
      toolCallId: memoryState.toolCallId,
      status: memoryState.status,
      serverName: memoryState.serverName,
      toolName: memoryState.toolName,
      arguments: memoryState.arguments,
      response: memoryState.response,
      isError: memoryState.isError,
    }
  }

  // 2. 从数据库推断状态
  return inferToolCallStatusFromDb(conversationService, message, toolCallId)
})

/**
 * 从数据库推断工具调用状态
 */
async function inferToolCallStatusFromDb(
  conversationService: ReturnType<typeof useConversationService>,
  message: { id: number; conversationId: number; toolCallData: unknown },
  toolCallId: string
): Promise<{
  messageId: number
  toolCallId: string
  status: ToolCallEventStatus
  serverName?: string
  toolName?: string
  arguments?: Record<string, unknown>
  response?: unknown
  isError?: boolean
}> {
  const messageId = message.id

  // 解析 toolCallData 获取工具调用信息
  const toolCallData = message.toolCallData as {
    type: 'tool_use'
    calls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  } | null

  if (!toolCallData || toolCallData.type !== 'tool_use') {
    throw createError({ statusCode: 404, message: '消息不包含工具调用' })
  }

  // 找到对应的工具调用
  const toolCall = toolCallData.calls.find(c => c.id === toolCallId)
  if (!toolCall) {
    throw createError({ statusCode: 404, message: '未找到指定的工具调用' })
  }

  // 解析工具名称（格式：mcp__serverName__toolName）
  const nameParts = toolCall.name.split('__')
  const serverName = nameParts.length >= 2 ? nameParts[1] : 'unknown'
  const toolName = nameParts.length >= 3 ? nameParts.slice(2).join('__') : toolCall.name

  // 查找对应的 tool 消息
  const conversationData = await conversationService.getWithMessages(message.conversationId)
  const messages = conversationData?.messages || []
  const toolMessage = messages.find((m: { role: string; toolCallData: unknown }) => {
    if (m.role !== 'tool') return false
    const data = m.toolCallData as { type: 'tool_result'; toolUseId: string } | null
    return data?.type === 'tool_result' && data.toolUseId === toolCallId
  })

  let status: ToolCallEventStatus
  let response: unknown
  let isError: boolean | undefined

  if (toolMessage) {
    // 有对应的 tool 消息
    const toolData = toolMessage.toolCallData as {
      type: 'tool_result'
      isError: boolean
    }

    if (toolMessage.content === 'User declined this tool call.') {
      status = 'cancelled'
    } else if (toolData.isError) {
      status = 'error'
      isError = true
    } else {
      status = 'done'
      isError = false
    }

    // 尝试解析响应内容
    try {
      response = JSON.parse(toolMessage.content)
    } catch {
      response = toolMessage.content
    }
  } else {
    // 无对应 tool 消息，检查是否在等待确认中
    if (isToolCallPending(messageId, `${messageId}_${toolCallId}`)) {
      status = 'pending'
    } else {
      // 不在等待中，可能已超时或中止
      status = 'cancelled'
    }
  }

  return {
    messageId,
    toolCallId,
    status,
    serverName,
    toolName,
    arguments: toolCall.input,
    response,
    isError,
  }
}

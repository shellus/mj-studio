/**
 * GET /api/messages/[id]/tool-calls/[toolCallId]
 * 查询工具调用状态
 *
 * 查询逻辑：从 assistant 消息的 toolCalls 字段读取
 */
import { useConversationService } from '../../../../services/conversation'
import { isToolCallPending } from '../../../../services/toolCallState'
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

  // 从 assistant 消息的 toolCalls 字段读取
  if (message.role !== 'assistant' || !message.toolCalls) {
    throw createError({ statusCode: 404, message: '工具调用不存在' })
  }

  const record = message.toolCalls.find(tc => tc.id === toolCallId)
  if (!record) {
    throw createError({ statusCode: 404, message: '工具调用不存在' })
  }

  // 检查是否在等待确认中
  const isPending = isToolCallPending(messageId, toolCallId)
  const status: ToolCallEventStatus = isPending ? 'pending' : record.status

  return {
    messageId,
    toolCallId: record.id,
    status,
    serverName: record.serverName,
    toolName: record.toolName,
    arguments: record.arguments,
    response: record.response,
    isError: record.isError,
  }
})

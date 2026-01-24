/**
 * POST /api/messages/[id]/tool-confirm
 * 确认或拒绝工具调用
 */
import { useConversationService } from '../../../services/conversation'
import { confirmToolCall } from '../../../services/toolCallState'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '消息ID不能为空' })
  }

  const messageId = parseInt(id, 10)
  if (isNaN(messageId)) {
    throw createError({ statusCode: 400, message: '无效的消息ID' })
  }

  const body = await readBody<{
    toolCallId: string
    action: 'approve' | 'reject'
  }>(event)

  if (!body.toolCallId || !body.action) {
    throw createError({ statusCode: 400, message: '缺少必要参数' })
  }

  // 获取消息
  const conversationService = useConversationService()
  const message = await conversationService.getMessageById(messageId)

  if (!message) {
    throw createError({ statusCode: 404, message: '消息不存在' })
  }

  // 验证权限：消息所属对话必须属于当前用户
  const conversation = await conversationService.getById(message.conversationId)
  if (!conversation || conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权操作此消息' })
  }

  // 确认或拒绝工具调用
  const approved = body.action === 'approve'
  const found = confirmToolCall(messageId, body.toolCallId, approved)

  if (!found) {
    throw createError({ statusCode: 404, message: '未找到待确认的工具调用' })
  }

  return { success: true }
})

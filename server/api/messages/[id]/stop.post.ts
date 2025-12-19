// POST /api/messages/[id]/stop - 停止生成
// 中止正在进行的 AI 消息生成
import { useConversationService } from '../../../services/conversation'
import { stopStreamingTask } from '../../../services/streamingTask'
import { getStreamingSession } from '../../../services/streamingCache'

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

  // 只有 AI 消息可以停止
  if (message.role !== 'assistant') {
    throw createError({ statusCode: 400, message: '只能停止 AI 消息' })
  }

  // 检查消息状态：只有 created/pending/streaming 状态可以停止
  const status = message.status
  if (status === 'completed' || status === 'stopped' || status === 'failed') {
    // 对已完成消息调用返回成功但不做任何操作（静默忽略）
    return { success: true }
  }

  // 检查是否有活跃的流式会话
  const session = getStreamingSession(messageId)
  if (!session) {
    // 没有活跃会话，可能已经完成或从未开始
    // 更新状态为 stopped（如果还是 created/pending）
    if (status === 'created' || status === 'pending') {
      await conversationService.updateMessageContentAndStatus(messageId, '', 'stopped')
    }
    return { success: true }
  }

  // 停止流式任务
  await stopStreamingTask(messageId)

  return { success: true }
})

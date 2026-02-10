import { db } from '../database'
import { conversations } from '../database/schema'
import { and, isNotNull, lt } from 'drizzle-orm'
import { useConversationService } from '../services/conversation'

/**
 * 清理过期的临时对话
 * 删除 expiresAt < 当前时间 的对话及其关联消息
 * @returns 删除的对话数量
 */
export async function cleanupExpiredConversations(): Promise<number> {
  const now = new Date()
  const conversationService = useConversationService()

  // 查找过期对话
  const expiredConversations = await db.query.conversations.findMany({
    where: and(
      isNotNull(conversations.expiresAt),
      lt(conversations.expiresAt, now),
    ),
    columns: { id: true, userId: true },
  })

  // 删除对话（级联删除消息）
  for (const conv of expiredConversations) {
    await conversationService.deleteById(conv.id, conv.userId)
  }

  return expiredConversations.length
}

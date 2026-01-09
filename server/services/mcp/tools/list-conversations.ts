/**
 * list_conversations 工具实现
 */
import type { AuthUser } from '../../../../app/shared/types'
import { db } from '../../../database'
import { conversations, messages, assistants } from '../../../database/schema'
import { eq, desc, count, and } from 'drizzle-orm'

export async function listConversations(user: AuthUser, assistantId: number, limit?: number) {
  // 验证助手属于用户
  const assistant = await db.query.assistants.findFirst({
    where: and(
      eq(assistants.id, assistantId),
      eq(assistants.userId, user.id),
    ),
  })

  if (!assistant) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '助手不存在' }) }],
      isError: true,
    }
  }

  const actualLimit = Math.min(limit || 20, 50)

  // 获取对话列表
  const conversationList = await db
    .select({
      id: conversations.id,
      title: conversations.title,
    })
    .from(conversations)
    .where(and(
      eq(conversations.userId, user.id),
      eq(conversations.assistantId, assistantId),
    ))
    .orderBy(desc(conversations.updatedAt))
    .limit(actualLimit)

  // 获取每个对话的消息数量
  const result = await Promise.all(
    conversationList.map(async (c) => {
      const [countResult] = await db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.conversationId, c.id))

      return {
        id: c.id,
        title: c.title,
        messageCount: countResult?.count || 0,
      }
    }),
  )

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ conversations: result }) }],
  }
}

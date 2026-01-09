/**
 * get_conversation 工具实现
 */
import type { AuthUser } from '../../../../app/shared/types'
import { db } from '../../../database'
import { conversations, messages } from '../../../database/schema'
import { eq, and, asc } from 'drizzle-orm'

export async function getConversation(user: AuthUser, conversationId: number) {
  // 获取对话详情
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, user.id),
    ),
  })

  if (!conversation) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '对话不存在' }) }],
      isError: true,
    }
  }

  // 获取消息列表
  const messageList = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  const result = {
    id: conversation.id,
    title: conversation.title,
    assistantId: conversation.assistantId,
    messages: messageList.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    })),
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

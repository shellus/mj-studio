// 助手服务层
import { db } from '../database'
import { assistants, conversations, type Assistant, type NewAssistant } from '../database/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { emitToUser, type ChatAssistantUpdated } from './globalEvents'

export function useAssistantService() {
  // 获取用户的所有助手
  async function listByUser(userId: number): Promise<Assistant[]> {
    return db.query.assistants.findMany({
      where: eq(assistants.userId, userId),
      orderBy: desc(assistants.createdAt),
    })
  }

  // 获取单个助手
  async function getById(id: number): Promise<Assistant | undefined> {
    return db.query.assistants.findFirst({
      where: eq(assistants.id, id),
    })
  }

  // 获取用户的默认助手
  async function getDefault(userId: number): Promise<Assistant | undefined> {
    return db.query.assistants.findFirst({
      where: and(eq(assistants.userId, userId), eq(assistants.isDefault, true)),
    })
  }

  // 创建助手
  async function create(data: {
    userId: number
    name: string
    description?: string
    avatar?: string
    systemPrompt?: string
    aimodelId?: number
    isDefault?: boolean
  }): Promise<Assistant> {
    // 如果设为默认，先取消其他默认
    if (data.isDefault) {
      await db.update(assistants)
        .set({ isDefault: false })
        .where(eq(assistants.userId, data.userId))
    }

    const [assistant] = await db.insert(assistants).values({
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      avatar: data.avatar ?? null,
      systemPrompt: data.systemPrompt ?? null,
      aimodelId: data.aimodelId ?? null,
      isDefault: data.isDefault ?? false,
    }).returning()

    if (!assistant) {
      throw new Error('创建助手失败')
    }
    return assistant
  }

  // 更新助手
  async function update(id: number, userId: number, data: Partial<{
    name: string
    description: string | null
    avatar: string | null
    systemPrompt: string | null
    aimodelId: number | null
    isDefault: boolean
    suggestions: string[] | null
    enableThinking: boolean
  }>): Promise<Assistant | undefined> {
    // 如果设为默认，先取消其他默认
    if (data.isDefault) {
      await db.update(assistants)
        .set({ isDefault: false })
        .where(eq(assistants.userId, userId))
    }

    const [updated] = await db.update(assistants)
      .set(data)
      .where(and(eq(assistants.id, id), eq(assistants.userId, userId)))
      .returning()

    if (updated) {
      // 广播助手更新事件
      await emitToUser<ChatAssistantUpdated>(userId, 'chat.assistant.updated', {
        assistant: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          avatar: updated.avatar,
          systemPrompt: updated.systemPrompt,
          aimodelId: updated.aimodelId,
          isDefault: updated.isDefault,
          suggestions: updated.suggestions,
          conversationCount: updated.conversationCount,
          enableThinking: updated.enableThinking,
        },
      })
    }

    return updated
  }

  // 删除助手
  async function remove(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(assistants)
      .where(and(eq(assistants.id, id), eq(assistants.userId, userId)))
      .returning()

    return result.length > 0
  }

  // 确保用户有默认助手（首次访问时创建）
  async function ensureDefault(userId: number): Promise<Assistant> {
    let defaultAssistant = await getDefault(userId)
    if (!defaultAssistant) {
      // 检查是否有任何助手
      const allAssistants = await listByUser(userId)
      if (allAssistants.length === 0) {
        // 创建默认助手
        defaultAssistant = await create({
          userId,
          name: '默认助手',
          description: '智能助理，可以帮助你完成各种任务',
          isDefault: true,
        })
      } else {
        // 将第一个设为默认
        const firstAssistant = allAssistants[0]
        if (firstAssistant) {
          defaultAssistant = await update(firstAssistant.id, userId, { isDefault: true })
        }
      }
    }
    return defaultAssistant!
  }

  // 重新统计并更新助手的对话数量（从数据库计算，确保准确）
  // 会自动广播 chat.assistant.updated 事件
  async function refreshConversationCount(assistantId: number): Promise<Assistant | undefined> {
    // 先获取助手信息以获取 userId
    const assistant = await getById(assistantId)
    if (!assistant) return undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.assistantId, assistantId))

    const count = Number(countResult?.count ?? 0)

    const [updated] = await db.update(assistants)
      .set({ conversationCount: count })
      .where(eq(assistants.id, assistantId))
      .returning()

    if (updated) {
      // 广播助手更新事件
      await emitToUser<ChatAssistantUpdated>(assistant.userId, 'chat.assistant.updated', {
        assistant: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          avatar: updated.avatar,
          systemPrompt: updated.systemPrompt,
          aimodelId: updated.aimodelId,
          isDefault: updated.isDefault,
          suggestions: updated.suggestions,
          conversationCount: updated.conversationCount,
          enableThinking: updated.enableThinking,
        },
      })
    }

    return updated
  }

  return {
    listByUser,
    getById,
    getDefault,
    create,
    update,
    remove,
    ensureDefault,
    refreshConversationCount,
  }
}

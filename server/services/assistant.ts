// 助手服务层
import { db } from '../database'
import { assistants, conversations, type Assistant, type NewAssistant } from '../database/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

// 助手列表返回类型（包含对话数量）
export type AssistantWithCount = Assistant & { conversationCount: number }

export function useAssistantService() {
  // 获取用户的所有助手（包含对话数量）
  async function listByUser(userId: number): Promise<AssistantWithCount[]> {
    const result = await db
      .select({
        id: assistants.id,
        userId: assistants.userId,
        name: assistants.name,
        description: assistants.description,
        avatar: assistants.avatar,
        systemPrompt: assistants.systemPrompt,
        modelConfigId: assistants.modelConfigId,
        modelName: assistants.modelName,
        isDefault: assistants.isDefault,
        createdAt: assistants.createdAt,
        conversationCount: sql<number>`count(${conversations.id})`.as('conversationCount'),
      })
      .from(assistants)
      .leftJoin(conversations, eq(conversations.assistantId, assistants.id))
      .where(eq(assistants.userId, userId))
      .groupBy(assistants.id)
      .orderBy(desc(assistants.createdAt))

    return result.map(row => ({
      ...row,
      conversationCount: Number(row.conversationCount),
    }))
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
    modelConfigId?: number
    modelName?: string
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
      modelConfigId: data.modelConfigId ?? null,
      modelName: data.modelName ?? null,
      isDefault: data.isDefault ?? false,
    }).returning()

    return assistant
  }

  // 更新助手
  async function update(id: number, userId: number, data: Partial<{
    name: string
    description: string | null
    avatar: string | null
    systemPrompt: string | null
    modelConfigId: number | null
    modelName: string | null
    isDefault: boolean
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
        defaultAssistant = await update(allAssistants[0].id, userId, { isDefault: true })
      }
    }
    return defaultAssistant!
  }

  return {
    listByUser,
    getById,
    getDefault,
    create,
    update,
    remove,
    ensureDefault,
  }
}

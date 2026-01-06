// 对话服务层
import { db } from '../database'
import { conversations, messages, type Conversation, type Message, type MessageMark, type MessageStatus, type MessageFile } from '../database/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'

export function useConversationService() {
  // 获取用户在某个助手下的所有对话
  async function listByAssistant(userId: number, assistantId: number): Promise<Conversation[]> {
    return db.query.conversations.findMany({
      where: and(eq(conversations.userId, userId), eq(conversations.assistantId, assistantId)),
      orderBy: [desc(conversations.updatedAt)],
    })
  }

  // 获取单个对话
  async function getById(id: number): Promise<Conversation | undefined> {
    return db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
  }

  // 获取对话详情（包含所有消息，按 sortId 排序）
  async function getWithMessages(id: number): Promise<{ conversation: Conversation, messages: Message[] } | undefined> {
    const conversation = await getById(id)
    if (!conversation) return undefined

    const messageList = await db.query.messages.findMany({
      where: eq(messages.conversationId, id),
      orderBy: [messages.sortId, messages.id], // 优先按 sortId 排序，sortId 为空时按 id
    })

    return { conversation, messages: messageList }
  }

  // 创建对话
  async function create(data: {
    userId: number
    assistantId: number
    title: string
  }): Promise<Conversation> {
    const now = new Date()
    const [conversation] = await db.insert(conversations).values({
      userId: data.userId,
      assistantId: data.assistantId,
      title: data.title,
      createdAt: now,
      updatedAt: now,
    }).returning()

    return conversation
  }

  // 更新对话标题
  async function updateTitle(id: number, userId: number, title: string): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()

    return updated
  }

  // 更新对话的更新时间
  async function touch(id: number): Promise<void> {
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, id))
  }

  // 删除对话（级联删除消息）
  async function remove(id: number, userId: number): Promise<boolean> {
    // 先验证对话属于该用户
    const conversation = await getById(id)
    if (!conversation || conversation.userId !== userId) {
      return false
    }

    // 删除所有消息
    await db.delete(messages)
      .where(eq(messages.conversationId, id))

    // 删除对话
    const result = await db.delete(conversations)
      .where(eq(conversations.id, id))
      .returning()

    return result.length > 0
  }

  // 添加消息
  async function addMessage(data: {
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    files?: MessageFile[]
    modelDisplayName?: string // 模型显示名称（格式："上游名称 / 模型显示名称"）
    mark?: MessageMark
    status?: MessageStatus
    sortId?: number
  }): Promise<Message> {
    const [message] = await db.insert(messages).values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      files: data.files ?? null,
      modelDisplayName: data.modelDisplayName ?? null,
      mark: data.mark ?? null,
      status: data.status ?? null,
      sortId: data.sortId ?? null,
    }).returning()

    // 如果没有指定 sortId，则设置为 id（普通消息）
    if (!data.sortId) {
      await db.update(messages)
        .set({ sortId: message.id })
        .where(eq(messages.id, message.id))
      message.sortId = message.id
    }

    // 更新对话时间
    await touch(data.conversationId)

    return message
  }

  // 更新消息的 sortId
  async function updateMessageSortId(messageId: number, sortId: number): Promise<void> {
    await db.update(messages)
      .set({ sortId })
      .where(eq(messages.id, messageId))
  }

  // 更新消息状态
  async function updateMessageStatus(messageId: number, status: MessageStatus): Promise<void> {
    await db.update(messages)
      .set({ status })
      .where(eq(messages.id, messageId))
  }

  // 更新消息内容和状态
  async function updateMessageContentAndStatus(messageId: number, content: string, status: MessageStatus, mark?: MessageMark): Promise<void> {
    const updateData: { content: string; status: MessageStatus; mark?: MessageMark | null } = { content, status }
    if (mark !== undefined) {
      updateData.mark = mark
    }
    await db.update(messages)
      .set(updateData)
      .where(eq(messages.id, messageId))
  }

  // 获取单条消息
  async function getMessageById(id: number): Promise<Message | undefined> {
    return db.query.messages.findFirst({
      where: eq(messages.id, id),
    })
  }

  // 删除消息
  async function removeMessage(messageId: number, userId: number): Promise<boolean> {
    // 先获取消息对应的对话
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    })
    if (!message) return false

    // 验证对话属于该用户
    const conversation = await getById(message.conversationId)
    if (!conversation || conversation.userId !== userId) {
      return false
    }

    const result = await db.delete(messages)
      .where(eq(messages.id, messageId))
      .returning()

    return result.length > 0
  }

  // 删除指定消息及之前的所有消息
  async function removeMessagesUntil(messageId: number, userId: number): Promise<{ conversationId: number; messageIds: number[] } | null> {
    // 获取消息
    const message = await getMessageById(messageId)
    if (!message) return null

    // 验证对话属于该用户
    const conversation = await getById(message.conversationId)
    if (!conversation || conversation.userId !== userId) {
      return null
    }

    // 获取对话的所有消息
    const data = await getWithMessages(message.conversationId)
    if (!data) return null

    // 找到目标消息的位置
    const targetIndex = data.messages.findIndex(m => m.id === messageId)
    if (targetIndex < 0) return null

    // 获取要删除的消息 ID 列表（该消息及之前的所有消息）
    const messageIdsToDelete = data.messages.slice(0, targetIndex + 1).map(m => m.id)

    // 批量删除
    const result = await db.delete(messages)
      .where(inArray(messages.id, messageIdsToDelete))
      .returning()

    if (result.length === 0) return null

    return {
      conversationId: message.conversationId,
      messageIds: messageIdsToDelete,
    }
  }

  // 根据首条消息自动生成对话标题
  function generateTitle(content: string): string {
    // 取前 20 个字符作为标题
    const title = content.replace(/\n/g, ' ').trim()
    if (title.length <= 20) {
      return title
    }
    return title.slice(0, 20) + '...'
  }

  // 分叉对话：从指定消息开始复制一个新对话
  async function fork(messageId: number, userId: number): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    // 获取消息
    const message = await getMessageById(messageId)
    if (!message) return null

    // 获取原对话并验证权限
    const originalConversation = await getById(message.conversationId)
    if (!originalConversation || originalConversation.userId !== userId) {
      return null
    }

    // 获取原对话的所有消息
    const data = await getWithMessages(message.conversationId)
    if (!data) return null

    // 找到目标消息的位置，复制该消息及之前的所有消息
    const targetIndex = data.messages.findIndex(m => m.id === messageId)
    if (targetIndex < 0) return null

    const messagesToCopy = data.messages.slice(0, targetIndex + 1)
    const messageNumber = targetIndex + 1

    // 创建新对话，标题格式：#🔀<消息序号> <原标题>
    const newConversation = await create({
      userId,
      assistantId: originalConversation.assistantId,
      title: `#🔀${messageNumber} ${originalConversation.title}`,
    })

    // 复制消息到新对话
    const newMessages: Message[] = []
    for (const msg of messagesToCopy) {
      const newMsg = await addMessage({
        conversationId: newConversation.id,
        role: msg.role,
        content: msg.content,
        files: msg.files ?? undefined,
        modelDisplayName: msg.modelDisplayName ?? undefined,
        mark: msg.mark ?? undefined,
        status: msg.status ?? undefined,
      })
      newMessages.push(newMsg)
    }

    return { conversation: newConversation, messages: newMessages }
  }

  return {
    listByAssistant,
    getById,
    getWithMessages,
    create,
    updateTitle,
    touch,
    remove,
    addMessage,
    updateMessageSortId,
    updateMessageStatus,
    updateMessageContentAndStatus,
    getMessageById,
    removeMessage,
    removeMessagesUntil,
    generateTitle,
    fork,
  }
}

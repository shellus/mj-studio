// 对话服务层
import { db } from '../database'
import { conversations, messages, type Conversation, type Message, type MessageMark, type MessageStatus, type MessageFile, type ToolCallRecord } from '../database/schema'
import { eq, and, desc, inArray, isNull, isNotNull } from 'drizzle-orm'
import { emitToUser, type ChatConversationCreated, type ChatConversationUpdated, type ChatConversationDeleted, type ChatMessageCreated, type ChatMessageUpdated, type ChatMessageDeleted, type ChatMessagesDeleted } from './globalEvents'
import { useAssistantService } from './assistant'

export function useConversationService() {
  // 获取用户在某个助手下的对话（支持按类型筛选和分页）
  async function listByAssistant(
    userId: number,
    assistantId: number,
    type?: 'permanent' | 'temporary' | 'all',
    limit?: number,
    offset?: number
  ): Promise<Conversation[]> {
    const baseCondition = and(
      eq(conversations.userId, userId),
      eq(conversations.assistantId, assistantId)
    )

    let whereCondition = baseCondition

    // 根据类型筛选
    if (type === 'permanent') {
      whereCondition = and(baseCondition, isNull(conversations.expiresAt))
    } else if (type === 'temporary') {
      whereCondition = and(baseCondition, isNotNull(conversations.expiresAt))
    }
    // type === 'all' 或 undefined 时不额外筛选

    // 构建查询配置
    const queryConfig: any = {
      where: whereCondition,
      orderBy: [desc(conversations.updatedAt)],
    }

    // 应用分页参数
    if (limit !== undefined) {
      queryConfig.limit = limit
    }
    if (offset !== undefined) {
      queryConfig.offset = offset
    }

    return db.query.conversations.findMany(queryConfig)
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
    autoApproveMcp?: boolean
    enableThinking?: boolean
    enableWebSearch?: boolean
    persistent?: boolean  // 是否永久保留对话，默认 false（临时对话）
  }): Promise<Conversation> {
    const now = new Date()
    // persistent !== true 时创建临时对话（1小时后过期）
    const expiresAt = data.persistent !== true
      ? new Date(Date.now() + 60 * 60 * 1000)  // 1 小时后
      : null  // 永久对话

    const [conversation] = await db.insert(conversations).values({
      userId: data.userId,
      assistantId: data.assistantId,
      title: data.title,
      autoApproveMcp: data.autoApproveMcp ?? false,
      enableThinking: data.enableThinking ?? false,
      enableWebSearch: data.enableWebSearch ?? false,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }).returning()

    if (!conversation) {
      throw new Error('创建对话失败')
    }

    // 更新助手的最后活跃时间
    const assistantService = useAssistantService()
    await assistantService.touchLastActive(data.assistantId)

    // 广播对话创建事件
    await emitToUser<ChatConversationCreated>(data.userId, 'chat.conversation.created', {
      conversation: {
        id: conversation.id,
        userId: conversation.userId,
        assistantId: conversation.assistantId,
        title: conversation.title,
        autoApproveMcp: conversation.autoApproveMcp,
        enableThinking: conversation.enableThinking,
        enableWebSearch: conversation.enableWebSearch,
        createdAt: conversation.createdAt instanceof Date ? conversation.createdAt.toISOString() : conversation.createdAt,
        updatedAt: conversation.updatedAt instanceof Date ? conversation.updatedAt.toISOString() : conversation.updatedAt,
      },
    })

    return conversation
  }

  // 更新对话标题
  async function updateTitle(id: number, userId: number, title: string): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()

    if (updated) {
      // 广播对话更新事件
      await emitToUser<ChatConversationUpdated>(userId, 'chat.conversation.updated', {
        conversation: {
          id: updated.id,
          title: updated.title,
          updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
        },
      })
    }

    return updated
  }

  // 更新对话的更新时间（同时更新助手的最后活跃时间）
  // 返回 assistantId 和 lastActiveAt 供事件广播使用
  async function touch(id: number): Promise<{ assistantId: number; lastActiveAt: Date } | null> {
    const conversation = await getById(id)
    if (!conversation) return null

    const now = new Date()
    await db.update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, id))

    // 更新助手的最后活跃时间
    const assistantService = useAssistantService()
    await assistantService.touchLastActive(conversation.assistantId)

    return { assistantId: conversation.assistantId, lastActiveAt: now }
  }

  // 延期临时对话（仅对有 expiresAt 的对话生效）
  async function extendExpirationIfTemporary(conversationId: number): Promise<void> {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: { expiresAt: true },
    })

    // 只延期临时对话（expiresAt != null）
    if (conversation?.expiresAt) {
      const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000) // 延期 1 小时
      await db.update(conversations)
        .set({ expiresAt: newExpiresAt })
        .where(eq(conversations.id, conversationId))
    }
  }

  // 根据 ID 删除对话（级联删除消息）- 内部方法，不验证权限
  async function deleteById(id: number, userId: number): Promise<{ success: boolean; assistantId?: number }> {
    const conversation = await getById(id)
    if (!conversation) {
      return { success: false }
    }

    const assistantId = conversation.assistantId

    // 删除所有消息
    await db.delete(messages)
      .where(eq(messages.conversationId, id))

    // 删除对话
    const result = await db.delete(conversations)
      .where(eq(conversations.id, id))
      .returning()

    if (result.length > 0) {
      // 广播对话删除事件
      await emitToUser<ChatConversationDeleted>(userId, 'chat.conversation.deleted', {
        conversationId: id,
        assistantId,
      })
    }

    return { success: result.length > 0, assistantId }
  }

  // 删除对话（带权限验证）
  async function remove(id: number, userId: number): Promise<{ success: boolean; assistantId?: number }> {
    // 先验证对话属于该用户
    const conversation = await getById(id)
    if (!conversation || conversation.userId !== userId) {
      return { success: false }
    }

    return await deleteById(id, userId)
  }

  // 添加消息
  // userId 参数用于广播事件，支持未来多用户协同场景
  async function addMessage(userId: number, data: {
    conversationId: number
    role: 'user' | 'assistant' | 'system'
    content: string
    files?: MessageFile[]
    toolCalls?: ToolCallRecord[]
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
      toolCalls: data.toolCalls ?? null,
      modelDisplayName: data.modelDisplayName ?? null,
      mark: data.mark ?? null,
      status: data.status ?? null,
      sortId: data.sortId ?? null,
    }).returning()

    if (!message) {
      throw new Error('添加消息失败')
    }

    // 如果没有指定 sortId，则设置为 id（普通消息）
    if (!data.sortId) {
      await db.update(messages)
        .set({ sortId: message.id })
        .where(eq(messages.id, message.id))
      message.sortId = message.id
    }

    // 仅用户消息延期临时对话
    if (data.role === 'user') {
      await extendExpirationIfTemporary(data.conversationId)
    }

    // 更新对话时间（返回 assistantId 和 lastActiveAt）
    const touchResult = await touch(data.conversationId)

    // 广播消息创建事件
    await emitToUser<ChatMessageCreated>(userId, 'chat.message.created', {
      conversationId: data.conversationId,
      assistantId: touchResult?.assistantId ?? 0,
      lastActiveAt: touchResult?.lastActiveAt.toISOString() ?? new Date().toISOString(),
      message: {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        files: message.files,
        modelDisplayName: message.modelDisplayName,
        mark: message.mark,
        status: message.status,
        sortId: message.sortId,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
      },
    })

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
  async function updateMessageContentAndStatus(messageId: number, content: string, status: MessageStatus, mark?: MessageMark, duration?: number): Promise<void> {
    const updateData: { content: string; status: MessageStatus; mark?: MessageMark | null; duration?: number } = { content, status }
    if (mark !== undefined) {
      updateData.mark = mark
    }
    if (duration !== undefined) {
      updateData.duration = duration
    }
    await db.update(messages)
      .set(updateData)
      .where(eq(messages.id, messageId))
  }

  // 更新 assistant 消息的 toolCalls 字段
  async function updateMessageToolCalls(messageId: number, toolCalls: ToolCallRecord[]): Promise<void> {
    await db.update(messages)
      .set({ toolCalls })
      .where(eq(messages.id, messageId))
  }

  // 更新消息的 files 字段
  async function updateMessageFiles(messageId: number, files: MessageFile[]): Promise<void> {
    await db.update(messages)
      .set({ files })
      .where(eq(messages.id, messageId))
  }

  // 获取单条消息
  async function getMessageById(id: number): Promise<Message | undefined> {
    return db.query.messages.findFirst({
      where: eq(messages.id, id),
    })
  }

  // 更新消息内容（带权限验证和事件广播）
  async function updateMessageContent(messageId: number, userId: number, content: string): Promise<boolean> {
    // 获取消息并验证权限
    const message = await getMessageById(messageId)
    if (!message) return false

    const conversation = await getById(message.conversationId)
    if (!conversation || conversation.userId !== userId) {
      return false
    }

    // 更新消息内容（保持原状态不变）
    await db.update(messages)
      .set({ content })
      .where(eq(messages.id, messageId))

    // 广播消息更新事件
    await emitToUser<ChatMessageUpdated>(userId, 'chat.message.updated', {
      conversationId: message.conversationId,
      message: {
        id: messageId,
        content,
        updatedAt: new Date().toISOString(),
      },
    })

    return true
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

    if (result.length > 0) {
      // 广播消息删除事件
      await emitToUser<ChatMessageDeleted>(userId, 'chat.message.deleted', {
        conversationId: message.conversationId,
        messageId,
      })
    }

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

    // 广播批量删除事件
    await emitToUser<ChatMessagesDeleted>(userId, 'chat.messages.deleted', {
      conversationId: message.conversationId,
      messageIds: messageIdsToDelete,
    })

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
      persistent: true,  // 分叉对话继承永久属性
    })

    // 复制消息到新对话
    const newMessages: Message[] = []
    for (const msg of messagesToCopy) {
      const newMsg = await addMessage(userId, {
        conversationId: newConversation.id,
        role: msg.role,
        content: msg.content,
        files: msg.files ?? undefined,
        modelDisplayName: msg.modelDisplayName ?? undefined,
        mark: msg.mark ?? undefined,
        status: msg.status ?? undefined,
        toolCalls: msg.toolCalls ?? undefined,
      })
      newMessages.push(newMsg)
    }

    return { conversation: newConversation, messages: newMessages }
  }

  // 更新对话的自动通过 MCP 设置
  async function updateAutoApproveMcp(id: number, userId: number, autoApproveMcp: boolean): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ autoApproveMcp, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()

    return updated
  }

  // 更新对话的思考开关
  async function updateEnableThinking(id: number, userId: number, enableThinking: boolean): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ enableThinking, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()

    if (updated) {
      await emitToUser<ChatConversationUpdated>(userId, 'chat.conversation.updated', {
        conversation: {
          id: updated.id,
          enableThinking: updated.enableThinking,
          updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
        },
      })
    }

    return updated
  }

  // 更新对话的 Web 搜索开关
  async function updateEnableWebSearch(id: number, userId: number, enableWebSearch: boolean): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations)
      .set({ enableWebSearch, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning()

    if (updated) {
      await emitToUser<ChatConversationUpdated>(userId, 'chat.conversation.updated', {
        conversation: {
          id: updated.id,
          enableWebSearch: updated.enableWebSearch,
          updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
        },
      })
    }

    return updated
  }

  return {
    listByAssistant,
    getById,
    getWithMessages,
    create,
    updateTitle,
    touch,
    extendExpirationIfTemporary,
    deleteById,
    remove,
    addMessage,
    updateMessageSortId,
    updateMessageStatus,
    updateMessageContentAndStatus,
    updateMessageToolCalls,
    updateMessageFiles,
    getMessageById,
    updateMessageContent,
    removeMessage,
    removeMessagesUntil,
    generateTitle,
    fork,
    updateAutoApproveMcp,
    updateEnableThinking,
    updateEnableWebSearch,
  }
}

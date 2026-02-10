// 测试临时对话的延期逻辑
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { useConversationService } from '../services/conversation'
import { useAssistantService } from '../services/assistant'
import { db } from '../database'
import { conversations } from '../database/schema'
import { eq } from 'drizzle-orm'

describe('临时对话延期逻辑', () => {
  let testUserId: number
  let testAssistantId: number
  let temporaryConvId: number
  let permanentConvId: number

  beforeAll(async () => {
    testUserId = 1 // 使用现有用户

    const assistantService = useAssistantService()
    const testAssistant = await assistantService.create({
      userId: testUserId,
      name: '测试助手-延期逻辑',
      aimodelId: 1,
    })
    testAssistantId = testAssistant.id

    const conversationService = useConversationService()

    // 创建临时对话
    const temporaryConv = await conversationService.create({
      userId: testUserId,
      assistantId: testAssistantId,
      title: '临时对话-测试延期',
      persistent: false,
    })
    temporaryConvId = temporaryConv.id

    // 创建永久对话
    const permanentConv = await conversationService.create({
      userId: testUserId,
      assistantId: testAssistantId,
      title: '永久对话-测试不延期',
      persistent: true,
    })
    permanentConvId = permanentConv.id
  })

  it('临时对话应该有 expiresAt 字段', async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, temporaryConvId),
    })

    expect(conv).toBeDefined()
    expect(conv!.expiresAt).toBeDefined()
    expect(conv!.expiresAt).toBeInstanceOf(Date)

    // 验证过期时间约为 1 小时后（允许 5 秒误差）
    const expectedExpiry = Date.now() + 60 * 60 * 1000
    const actualExpiry = conv!.expiresAt!.getTime()
    expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(5000)
  })

  it('永久对话不应该有 expiresAt 字段', async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, permanentConvId),
    })

    expect(conv).toBeDefined()
    expect(conv!.expiresAt).toBeNull()
  })

  it('用户消息应该延期临时对话', async () => {
    const conversationService = useConversationService()

    // 手动设置过期时间为 30 分钟后，方便测试
    const oldExpiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await db.update(conversations)
      .set({ expiresAt: oldExpiresAt })
      .where(eq(conversations.id, temporaryConvId))

    const initialExpiresAt = oldExpiresAt.getTime()

    // 等待 1 秒确保时间差异明显
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 添加用户消息
    await conversationService.addMessage(testUserId, {
      conversationId: temporaryConvId,
      role: 'user',
      content: '测试消息',
    })

    // 获取延期后的过期时间
    const updatedConv = await db.query.conversations.findFirst({
      where: eq(conversations.id, temporaryConvId),
    })
    const updatedExpiresAt = updatedConv!.expiresAt!.getTime()

    // 验证过期时间被延期了（应该从 30 分钟延长到 1 小时）
    expect(updatedExpiresAt).toBeGreaterThan(initialExpiresAt)

    // 验证新的过期时间约为 1 小时后（允许 5 秒误差）
    const expectedExpiry = Date.now() + 60 * 60 * 1000
    expect(Math.abs(updatedExpiresAt - expectedExpiry)).toBeLessThan(5000)
  })

  it('AI 消息不应该延期临时对话', async () => {
    const conversationService = useConversationService()

    // 获取当前过期时间
    const beforeConv = await db.query.conversations.findFirst({
      where: eq(conversations.id, temporaryConvId),
    })
    const beforeExpiresAt = beforeConv!.expiresAt!.getTime()

    // 等待 100ms
    await new Promise(resolve => setTimeout(resolve, 100))

    // 添加 AI 消息
    await conversationService.addMessage(testUserId, {
      conversationId: temporaryConvId,
      role: 'assistant',
      content: 'AI 回复',
    })

    // 获取添加 AI 消息后的过期时间
    const afterConv = await db.query.conversations.findFirst({
      where: eq(conversations.id, temporaryConvId),
    })
    const afterExpiresAt = afterConv!.expiresAt!.getTime()

    // 验证过期时间未改变（允许 1ms 误差）
    expect(Math.abs(afterExpiresAt - beforeExpiresAt)).toBeLessThan(1)
  })

  it('用户消息不应该影响永久对话', async () => {
    const conversationService = useConversationService()

    // 永久对话初始应该没有 expiresAt
    const beforeConv = await db.query.conversations.findFirst({
      where: eq(conversations.id, permanentConvId),
    })
    expect(beforeConv!.expiresAt).toBeNull()

    // 添加用户消息
    await conversationService.addMessage(testUserId, {
      conversationId: permanentConvId,
      role: 'user',
      content: '测试消息',
    })

    // 验证永久对话仍然没有 expiresAt
    const afterConv = await db.query.conversations.findFirst({
      where: eq(conversations.id, permanentConvId),
    })
    expect(afterConv!.expiresAt).toBeNull()
  })

  afterAll(async () => {
    // 清理测试数据
    const conversationService = useConversationService()
    await conversationService.remove(temporaryConvId, testUserId)
    await conversationService.remove(permanentConvId, testUserId)

    const assistantService = useAssistantService()
    await assistantService.remove(testAssistantId, testUserId)
  })
})

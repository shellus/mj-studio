// 测试清理过期对话功能
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cleanupExpiredConversations } from '../tasks/cleanupExpiredConversations'
import { useConversationService } from '../services/conversation'
import { useAssistantService } from '../services/assistant'
import { db } from '../database'
import { conversations } from '../database/schema'
import { eq } from 'drizzle-orm'

describe('清理过期对话', () => {
  let testUserId: number
  let testAssistantId: number
  let permanentConvId: number
  let temporaryConvId: number
  let expiredConvId: number

  beforeAll(async () => {
    // 创建测试用户和助手（假设已有创建方法）
    testUserId = 1 // 使用现有用户

    const assistantService = useAssistantService()
    const testAssistant = await assistantService.create({
      userId: testUserId,
      name: '测试助手-清理任务',
      aimodelId: 1,
    })
    testAssistantId = testAssistant.id

    const conversationService = useConversationService()

    // 创建永久对话
    const permanentConv = await conversationService.create({
      userId: testUserId,
      assistantId: testAssistantId,
      title: '永久对话',
      persistent: true,
    })
    permanentConvId = permanentConv.id

    // 创建临时对话（未过期）
    const temporaryConv = await conversationService.create({
      userId: testUserId,
      assistantId: testAssistantId,
      title: '临时对话-未过期',
      persistent: false,
    })
    temporaryConvId = temporaryConv.id

    // 创建已过期的临时对话（手动设置过期时间为过去）
    const expiredConv = await conversationService.create({
      userId: testUserId,
      assistantId: testAssistantId,
      title: '临时对话-已过期',
      persistent: false,
    })
    expiredConvId = expiredConv.id

    // 手动修改过期时间为 1 小时前
    await db.update(conversations)
      .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(conversations.id, expiredConvId))
  })

  it('应该删除过期的临时对话，但保留永久对话和未过期的临时对话', async () => {
    // 执行清理任务
    const deletedCount = await cleanupExpiredConversations()

    // 应该删除 1 个过期对话
    expect(deletedCount).toBe(1)

    const conversationService = useConversationService()

    // 永久对话应该仍然存在
    const permanentConv = await conversationService.getById(permanentConvId)
    expect(permanentConv).toBeDefined()

    // 未过期的临时对话应该仍然存在
    const temporaryConv = await conversationService.getById(temporaryConvId)
    expect(temporaryConv).toBeDefined()

    // 过期的临时对话应该被删除
    const expiredConv = await conversationService.getById(expiredConvId)
    expect(expiredConv).toBeUndefined()
  })

  afterAll(async () => {
    // 清理测试数据
    const conversationService = useConversationService()
    await conversationService.remove(permanentConvId, testUserId)
    await conversationService.remove(temporaryConvId, testUserId)

    const assistantService = useAssistantService()
    await assistantService.remove(testAssistantId, testUserId)
  })
})

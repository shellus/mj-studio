// 测试对话列表分页功能
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { useConversationService } from '../services/conversation'
import { useAssistantService } from '../services/assistant'

describe('对话列表分页功能', () => {
  let testUserId: number
  let testAssistantId: number
  const conversationIds: number[] = []

  beforeAll(async () => {
    testUserId = 1 // 使用现有用户

    const assistantService = useAssistantService()
    const testAssistant = await assistantService.create({
      userId: testUserId,
      name: '测试助手-分页功能',
      aimodelId: 1,
    })
    testAssistantId = testAssistant.id

    const conversationService = useConversationService()

    // 创建 20 个永久对话用于测试分页
    for (let i = 1; i <= 20; i++) {
      const conv = await conversationService.create({
        userId: testUserId,
        assistantId: testAssistantId,
        title: `测试对话 ${i}`,
        persistent: true,
      })
      conversationIds.push(conv.id)
      // 稍微延迟，确保 updatedAt 有差异
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // 创建 5 个临时对话
    for (let i = 1; i <= 5; i++) {
      const conv = await conversationService.create({
        userId: testUserId,
        assistantId: testAssistantId,
        title: `临时对话 ${i}`,
        persistent: false,
      })
      conversationIds.push(conv.id)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  })

  it('不带分页参数应返回所有对话', async () => {
    const conversationService = useConversationService()
    const conversations = await conversationService.listByAssistant(testUserId, testAssistantId)

    expect(conversations.length).toBe(25) // 20 个永久 + 5 个临时
  })

  it('limit 参数应限制返回数量', async () => {
    const conversationService = useConversationService()
    const conversations = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      15
    )

    expect(conversations.length).toBe(15)
  })

  it('offset 参数应跳过指定数量', async () => {
    const conversationService = useConversationService()

    // 获取前 10 个
    const firstPage = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      10,
      0
    )

    // 获取第 11-20 个
    const secondPage = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      10,
      10
    )

    expect(firstPage.length).toBe(10)
    expect(secondPage.length).toBe(10)

    // 验证两页的对话 ID 不重复
    const firstPageIds = firstPage.map(c => c.id)
    const secondPageIds = secondPage.map(c => c.id)
    const intersection = firstPageIds.filter(id => secondPageIds.includes(id))
    expect(intersection.length).toBe(0)
  })

  it('limit 和 offset 组合应正确分页', async () => {
    const conversationService = useConversationService()

    // 第一页：前 15 个
    const page1 = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      15,
      0
    )

    // 第二页：第 16-25 个（剩余 10 个）
    const page2 = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      15,
      15
    )

    expect(page1.length).toBe(15)
    expect(page2.length).toBe(10) // 只剩 10 个
  })

  it('按类型筛选时分页应正常工作', async () => {
    const conversationService = useConversationService()

    // 获取永久对话的前 10 个
    const permanentPage1 = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      'permanent',
      10,
      0
    )

    // 获取永久对话的第 11-20 个
    const permanentPage2 = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      'permanent',
      10,
      10
    )

    expect(permanentPage1.length).toBe(10)
    expect(permanentPage2.length).toBe(10)

    // 验证都是永久对话
    permanentPage1.forEach(conv => {
      expect(conv.expiresAt).toBeNull()
    })
    permanentPage2.forEach(conv => {
      expect(conv.expiresAt).toBeNull()
    })
  })

  it('临时对话分页应正常工作', async () => {
    const conversationService = useConversationService()

    // 获取临时对话（共 5 个）
    const temporaryConvs = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      'temporary',
      3,
      0
    )

    expect(temporaryConvs.length).toBe(3)

    // 验证都是临时对话
    temporaryConvs.forEach(conv => {
      expect(conv.expiresAt).not.toBeNull()
    })
  })

  it('offset 超出范围应返回空数组', async () => {
    const conversationService = useConversationService()

    const conversations = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      10,
      100 // 超出范围
    )

    expect(conversations.length).toBe(0)
  })

  it('对话应按 updatedAt 降序排列', async () => {
    const conversationService = useConversationService()

    const conversations = await conversationService.listByAssistant(
      testUserId,
      testAssistantId,
      undefined,
      25
    )

    // 验证排序（最新的在前）
    for (let i = 0; i < conversations.length - 1; i++) {
      const current = new Date(conversations[i].updatedAt).getTime()
      const next = new Date(conversations[i + 1].updatedAt).getTime()
      expect(current).toBeGreaterThanOrEqual(next)
    }
  })

  afterAll(async () => {
    // 清理测试数据
    const conversationService = useConversationService()
    for (const id of conversationIds) {
      await conversationService.remove(id, testUserId)
    }

    const assistantService = useAssistantService()
    await assistantService.remove(testAssistantId, testUserId)
  })
})

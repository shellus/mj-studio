import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock drizzle ORM db 对象 - 使用工厂函数避免提升问题
vi.mock('../../database', () => {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn(() => ({ returning: mockReturning }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockSet }))

  return {
    db: {
      update: mockUpdate,
      query: {
        conversations: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        messages: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(),
      delete: vi.fn(),
    },
  }
})

// Mock globalEvents
vi.mock('../globalEvents', () => ({
  emitToUser: vi.fn(),
}))

// Mock assistant service
vi.mock('../assistant', () => ({
  useAssistantService: () => ({
    touchLastActive: vi.fn(),
  }),
}))

// 导入被测模块和 mock 后的 db
import { useConversationService } from '../conversation'
import { db } from '../../database'

describe('Conversation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateEnableThinking', () => {
    it('should return updated conversation when update succeeds', async () => {
      const mockConversation = {
        id: 1,
        userId: 100,
        assistantId: 10,
        title: 'Test Conversation',
        enableThinking: true,
        enableWebSearch: false,
        autoApproveMcp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // 设置 mock 链式调用返回值
      const mockReturning = vi.fn().mockResolvedValueOnce([mockConversation])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableThinking(1, 100, true)

      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
      expect(result?.enableThinking).toBe(true)
      expect(db.update).toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        enableThinking: true,
      }))
    })

    it('should return undefined when conversation does not exist', async () => {
      const mockReturning = vi.fn().mockResolvedValueOnce([])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableThinking(999, 100, true)

      expect(result).toBeUndefined()
    })

    it('should return undefined when userId does not match', async () => {
      // 当 userId 不匹配时，drizzle 的 where 条件不会匹配任何记录
      const mockReturning = vi.fn().mockResolvedValueOnce([])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableThinking(1, 999, true)

      expect(result).toBeUndefined()
    })

    it('should set enableThinking to false when passed false', async () => {
      const mockConversation = {
        id: 1,
        userId: 100,
        assistantId: 10,
        title: 'Test Conversation',
        enableThinking: false,
        enableWebSearch: false,
        autoApproveMcp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockReturning = vi.fn().mockResolvedValueOnce([mockConversation])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableThinking(1, 100, false)

      expect(result).toBeDefined()
      expect(result?.enableThinking).toBe(false)
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        enableThinking: false,
      }))
    })
  })

  describe('updateEnableWebSearch', () => {
    it('should return updated conversation when update succeeds', async () => {
      const mockConversation = {
        id: 1,
        userId: 100,
        assistantId: 10,
        title: 'Test Conversation',
        enableThinking: false,
        enableWebSearch: true,
        autoApproveMcp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockReturning = vi.fn().mockResolvedValueOnce([mockConversation])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableWebSearch(1, 100, true)

      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
      expect(result?.enableWebSearch).toBe(true)
      expect(db.update).toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        enableWebSearch: true,
      }))
    })

    it('should return undefined when conversation does not exist', async () => {
      const mockReturning = vi.fn().mockResolvedValueOnce([])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableWebSearch(999, 100, true)

      expect(result).toBeUndefined()
    })

    it('should return undefined when userId does not match', async () => {
      // 当 userId 不匹配时，drizzle 的 where 条件不会匹配任何记录
      const mockReturning = vi.fn().mockResolvedValueOnce([])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableWebSearch(1, 999, true)

      expect(result).toBeUndefined()
    })

    it('should set enableWebSearch to false when passed false', async () => {
      const mockConversation = {
        id: 1,
        userId: 100,
        assistantId: 10,
        title: 'Test Conversation',
        enableThinking: false,
        enableWebSearch: false,
        autoApproveMcp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockReturning = vi.fn().mockResolvedValueOnce([mockConversation])
      const mockWhere = vi.fn(() => ({ returning: mockReturning }))
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      vi.mocked(db.update).mockReturnValueOnce({ set: mockSet } as any)

      const service = useConversationService()
      const result = await service.updateEnableWebSearch(1, 100, false)

      expect(result).toBeDefined()
      expect(result?.enableWebSearch).toBe(false)
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        enableWebSearch: false,
      }))
    })
  })
})

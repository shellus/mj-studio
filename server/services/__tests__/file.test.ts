import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isNativeImageMimeType, isPdfMimeType, readFileAsText } from '../file'

// Mock fs module for readFileAsText tests
vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>()
  return {
    ...original,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
  }
})

import { existsSync, readFileSync, statSync } from 'fs'

describe('File Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isNativeImageMimeType', () => {
    it('should return true for image/png', () => {
      expect(isNativeImageMimeType('image/png')).toBe(true)
    })

    it('should return true for image/jpeg', () => {
      expect(isNativeImageMimeType('image/jpeg')).toBe(true)
    })

    it('should return true for image/gif', () => {
      expect(isNativeImageMimeType('image/gif')).toBe(true)
    })

    it('should return true for image/webp', () => {
      expect(isNativeImageMimeType('image/webp')).toBe(true)
    })

    it('should return false for image/svg+xml (SVG is text-based)', () => {
      expect(isNativeImageMimeType('image/svg+xml')).toBe(false)
    })

    it('should return false for text/plain', () => {
      expect(isNativeImageMimeType('text/plain')).toBe(false)
    })

    it('should return false for application/pdf', () => {
      expect(isNativeImageMimeType('application/pdf')).toBe(false)
    })

    it('should return false for application/json', () => {
      expect(isNativeImageMimeType('application/json')).toBe(false)
    })
  })

  describe('isPdfMimeType', () => {
    it('should return true for application/pdf', () => {
      expect(isPdfMimeType('application/pdf')).toBe(true)
    })

    it('should return false for image/png', () => {
      expect(isPdfMimeType('image/png')).toBe(false)
    })

    it('should return false for text/plain', () => {
      expect(isPdfMimeType('text/plain')).toBe(false)
    })

    it('should return false for application/json', () => {
      expect(isPdfMimeType('application/json')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isPdfMimeType('')).toBe(false)
    })
  })

  describe('readFileAsText', () => {
    it('should return content and size when file exists', () => {
      const mockContent = 'Hello, World!'
      const mockBuffer = Buffer.from(mockContent, 'utf-8')

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockBuffer)
      vi.mocked(statSync).mockReturnValue({ size: mockBuffer.length } as any)

      const result = readFileAsText('test.txt')

      expect(result).not.toBeNull()
      expect(result?.content).toBe(mockContent)
      expect(result?.size).toBe(mockBuffer.length)
    })

    it('should return null when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = readFileAsText('nonexistent.txt')

      expect(result).toBeNull()
    })

    it('should handle UTF-8 content correctly', () => {
      const mockContent = '你好，世界！'
      const mockBuffer = Buffer.from(mockContent, 'utf-8')

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockBuffer)
      vi.mocked(statSync).mockReturnValue({ size: mockBuffer.length } as any)

      const result = readFileAsText('chinese.txt')

      expect(result).not.toBeNull()
      expect(result?.content).toBe(mockContent)
    })

    it('should handle empty file', () => {
      const mockBuffer = Buffer.from('', 'utf-8')

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(mockBuffer)
      vi.mocked(statSync).mockReturnValue({ size: 0 } as any)

      const result = readFileAsText('empty.txt')

      expect(result).not.toBeNull()
      expect(result?.content).toBe('')
      expect(result?.size).toBe(0)
    })
  })
})

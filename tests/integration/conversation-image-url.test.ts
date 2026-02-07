import { describe, it, expect, vi, beforeAll } from 'vitest'
import { saveBase64FileWithUrl, extractAndSaveBase64Images } from '../../server/services/file'

// Mock Nuxt 的 useRuntimeConfig
beforeAll(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({
    publicUrl: 'http://localhost:3000',
  }))
})

describe('对话图片 URL 引用', () => {
  // 1x1 透明 PNG 的 base64
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  describe('saveBase64FileWithUrl', () => {
    it('应返回包含所有字段的 MessageFile', () => {
      const result = saveBase64FileWithUrl(testBase64)

      expect(result).not.toBeNull()
      expect(result?.fileName).toMatch(/\.png$/)
      expect(result?.mimeType).toBe('image/png')
      expect(result?.size).toBeGreaterThan(0)
      expect(result?.name).toBe(result?.fileName)
    })

    it('应正确处理带原始文件名的情况', () => {
      const result = saveBase64FileWithUrl(testBase64, 'test-image.png')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('test-image.png')
    })
  })

  describe('extractAndSaveBase64Images', () => {
    it('应提取并保存 Markdown 格式的 base64 图片', () => {
      const content = `这是一段文字\n![image](${testBase64})\n更多文字`

      const { newContent, files } = extractAndSaveBase64Images(content)

      expect(files).toHaveLength(1)
      expect(files[0]?.fileName).toMatch(/\.png$/)
      expect(newContent).not.toContain('base64')
      expect(newContent).toContain('/api/files/')
    })

    it('无 base64 图片时应返回原内容', () => {
      const content = '纯文本内容，没有图片'

      const { newContent, files } = extractAndSaveBase64Images(content)

      expect(files).toHaveLength(0)
      expect(newContent).toBe(content)
    })

    it('应处理多张图片', () => {
      const content = `![img1](${testBase64})\n文字\n![img2](${testBase64})`

      const { newContent, files } = extractAndSaveBase64Images(content)

      expect(files).toHaveLength(2)
      expect(newContent).not.toContain('base64')
    })
  })
})

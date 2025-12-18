// 共享模块测试 - 验证类型和常量的一致性
import { describe, it, expect } from 'vitest'
import {
  IMAGE_MODEL_TYPES,
  CHAT_MODEL_TYPES,
  API_FORMATS,
  MODEL_API_FORMAT_OPTIONS,
  DEFAULT_MODEL_NAMES,
  DEFAULT_ESTIMATED_TIMES,
  MODEL_TYPE_LABELS,
  API_FORMAT_LABELS,
  SQIDS_ALPHABET,
  SQIDS_MIN_LENGTH,
} from '../app/shared/constants'
import type {
  ImageModelType,
  ChatModelType,
  ApiFormat,
  ModelTypeConfig,
} from '../app/shared/types'

describe('共享常量测试', () => {
  describe('模型类型常量', () => {
    it('IMAGE_MODEL_TYPES 应包含所有绘图模型', () => {
      const expectedTypes: ImageModelType[] = [
        'midjourney', 'gemini', 'flux', 'dalle',
        'doubao', 'gpt4o-image', 'grok-image', 'qwen-image',
      ]
      expect(IMAGE_MODEL_TYPES).toEqual(expectedTypes)
    })

    it('CHAT_MODEL_TYPES 应包含所有对话模型', () => {
      const expectedTypes: ChatModelType[] = ['gpt', 'claude', 'gemini-chat', 'deepseek', 'qwen-chat']
      expect(CHAT_MODEL_TYPES).toEqual(expectedTypes)
    })

    it('API_FORMATS 应包含所有支持的格式', () => {
      const expectedFormats: ApiFormat[] = ['mj-proxy', 'gemini', 'dalle', 'openai-chat']
      expect(API_FORMATS).toEqual(expectedFormats)
    })
  })

  describe('模型配置映射', () => {
    it('每个绘图模型类型都应有对应的 API 格式选项', () => {
      for (const modelType of IMAGE_MODEL_TYPES) {
        expect(MODEL_API_FORMAT_OPTIONS[modelType]).toBeDefined()
        expect(MODEL_API_FORMAT_OPTIONS[modelType].length).toBeGreaterThan(0)
      }
    })

    it('每个绘图模型类型都应有默认模型名称', () => {
      for (const modelType of IMAGE_MODEL_TYPES) {
        expect(DEFAULT_MODEL_NAMES[modelType]).toBeDefined()
        expect(typeof DEFAULT_MODEL_NAMES[modelType]).toBe('string')
      }
    })

    it('每个绘图模型类型都应有默认预估时间', () => {
      for (const modelType of IMAGE_MODEL_TYPES) {
        expect(DEFAULT_ESTIMATED_TIMES[modelType]).toBeDefined()
        expect(typeof DEFAULT_ESTIMATED_TIMES[modelType]).toBe('number')
        expect(DEFAULT_ESTIMATED_TIMES[modelType]).toBeGreaterThan(0)
      }
    })
  })

  describe('UI 标签映射', () => {
    it('每个绘图模型类型都应有显示标签', () => {
      for (const modelType of IMAGE_MODEL_TYPES) {
        expect(MODEL_TYPE_LABELS[modelType]).toBeDefined()
        expect(typeof MODEL_TYPE_LABELS[modelType]).toBe('string')
      }
    })

    it('每个 API 格式都应有显示标签', () => {
      for (const format of API_FORMATS) {
        expect(API_FORMAT_LABELS[format]).toBeDefined()
        expect(typeof API_FORMAT_LABELS[format]).toBe('string')
      }
    })
  })

  describe('Sqids 配置', () => {
    it('SQIDS_ALPHABET 应为有效字母表', () => {
      expect(SQIDS_ALPHABET.length).toBeGreaterThan(10)
      // 检查没有重复字符
      const chars = new Set(SQIDS_ALPHABET.split(''))
      expect(chars.size).toBe(SQIDS_ALPHABET.length)
    })

    it('SQIDS_MIN_LENGTH 应为正整数', () => {
      expect(SQIDS_MIN_LENGTH).toBeGreaterThan(0)
      expect(Number.isInteger(SQIDS_MIN_LENGTH)).toBe(true)
    })
  })
})

describe('类型一致性测试', () => {
  it('ModelTypeConfig 接口应正确定义', () => {
    const config: ModelTypeConfig = {
      category: 'image',
      modelType: 'gemini',
      apiFormat: 'gemini',
      modelName: 'gemini-2.5-flash-image',
      estimatedTime: 30,
    }
    expect(config.category).toBe('image')
    expect(IMAGE_MODEL_TYPES).toContain(config.modelType)
    expect(API_FORMATS).toContain(config.apiFormat)
  })

  it('对话模型配置应正确定义', () => {
    const config: ModelTypeConfig = {
      category: 'chat',
      modelType: 'gpt',
      apiFormat: 'openai-chat',
      modelName: 'gpt-4o',
    }
    expect(config.category).toBe('chat')
    expect(CHAT_MODEL_TYPES).toContain(config.modelType)
  })
})

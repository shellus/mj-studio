/**
 * 推理参数构建器测试
 */

import { describe, it, expect } from 'vitest'
import { buildReasoningParams } from '../reasoningBuilder'

describe('buildReasoningParams', () => {
  describe('OpenAI 推理模型', () => {
    it('应该为 o1 模型返回 reasoning_effort', () => {
      const result = buildReasoningParams('o1', true, 'medium')
      expect(result).toEqual({ reasoning_effort: 'medium' })
    })

    it('应该为 o3-mini 模型返回 reasoning_effort', () => {
      const result = buildReasoningParams('o3-mini', true, 'high')
      expect(result).toEqual({ reasoning_effort: 'high' })
    })

    it('应该为 gpt-5.1 模型返回 reasoning_effort', () => {
      const result = buildReasoningParams('gpt-5.1', true, 'low')
      expect(result).toEqual({ reasoning_effort: 'low' })
    })
  })

  describe('智谱 GLM 模型', () => {
    it('应该为 glm-4.7 模型返回 enable_thinking', () => {
      const result = buildReasoningParams('glm-4.7', true)
      expect(result).toEqual({ enable_thinking: true })
    })

    it('关闭思考时应该返回 false', () => {
      const result = buildReasoningParams('glm-4.7', false)
      expect(result).toEqual({ enable_thinking: false })
    })
  })

  describe('通义千问模型', () => {
    it('应该为 qwq 模型返回 enable_thinking', () => {
      const result = buildReasoningParams('qwq-32b', true)
      expect(result).toEqual({ enable_thinking: true })
    })

    it('关闭思考时应该返回 false', () => {
      const result = buildReasoningParams('qwq-32b', false)
      expect(result).toEqual({ enable_thinking: false })
    })
  })

  describe('Claude 思考模型', () => {
    it('应该为 claude-3.7 模型返回 thinking 对象', () => {
      const result = buildReasoningParams('claude-3.7-sonnet', true, 'medium')
      expect(result).toEqual({
        thinking: {
          type: 'enabled',
          budget_tokens: 10000
        }
      })
    })

    it('应该为 claude-4 模型返回 thinking 对象', () => {
      const result = buildReasoningParams('claude-4-opus', true, 'high')
      expect(result).toEqual({
        thinking: {
          type: 'enabled',
          budget_tokens: 20000
        }
      })
    })

    it('关闭思考时应该返回 disabled', () => {
      const result = buildReasoningParams('claude-3.7-sonnet', false)
      expect(result).toEqual({ thinking: { type: 'disabled' } })
    })
  })

  describe('Gemini 3 模型', () => {
    it('应该为 gemini-3-flash 返回 reasoning_effort', () => {
      const result = buildReasoningParams('gemini-3-flash', true, 'medium')
      expect(result).toEqual({ reasoning_effort: 'medium' })
    })
  })

  describe('Gemini 2.5 模型', () => {
    it('应该为 gemini-2.5-pro 返回 extra_body', () => {
      const result = buildReasoningParams('gemini-2.5-pro', true)
      expect(result).toEqual({
        extra_body: {
          google: {
            thinking_config: {
              thinking_budget: -1,
              include_thoughts: true
            }
          }
        }
      })
    })

    it('关闭思考时 flash 模型应该返回 budget 为 0', () => {
      const result = buildReasoningParams('gemini-2.5-flash', false)
      expect(result).toEqual({
        extra_body: {
          google: {
            thinking_config: {
              thinking_budget: 0
            }
          }
        }
      })
    })
  })

  describe('混元模型', () => {
    it('应该为混元模型返回 enable_thinking', () => {
      const result = buildReasoningParams('hunyuan-turbo-latest', true)
      expect(result).toEqual({ enable_thinking: true })
    })

    it('关闭思考时应该返回 false', () => {
      const result = buildReasoningParams('hunyuan-turbo-latest', false)
      expect(result).toEqual({ enable_thinking: false })
    })
  })

  describe('豆包模型', () => {
    it('应该为豆包模型返回 thinking 对象', () => {
      const result = buildReasoningParams('doubao-pro', true)
      expect(result).toEqual({ thinking: { type: 'enabled' } })
    })

    it('关闭思考时应该返回 disabled', () => {
      const result = buildReasoningParams('doubao-pro', false)
      expect(result).toEqual({ thinking: { type: 'disabled' } })
    })
  })

  describe('未知模型', () => {
    it('应该为未知模型返回空对象', () => {
      const result = buildReasoningParams('unknown-model', true)
      expect(result).toEqual({})
    })

    it('关闭思考时也应该返回空对象', () => {
      const result = buildReasoningParams('unknown-model', false)
      expect(result).toEqual({})
    })
  })
})
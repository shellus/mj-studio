import { describe, it, expect } from 'vitest'
import { unwrapMcpResult } from '../utils/external-api'

describe('unwrapMcpResult', () => {
  it('应正确解包成功的 MCP 结果', () => {
    const mcpResult = {
      content: [{ type: 'text' as const, text: JSON.stringify({ models: [{ id: 1, name: 'test' }] }) }],
    }

    const { data, isError } = unwrapMcpResult(mcpResult)
    expect(isError).toBe(false)
    expect(data.models).toHaveLength(1)
    expect(data.models[0].name).toBe('test')
  })

  it('应正确解包带 isError 的错误结果', () => {
    const mcpResult = {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: '模型不存在' }) }],
      isError: true,
    }

    const { data, isError } = unwrapMcpResult(mcpResult)
    expect(isError).toBe(true)
    expect(data.error).toBe('模型不存在')
  })

  it('应处理空内容', () => {
    const mcpResult = {
      content: [] as Array<{ type: 'text'; text: string }>,
    }

    const { data, isError } = unwrapMcpResult(mcpResult)
    expect(isError).toBe(true)
    expect(data.error).toBe('空响应')
  })

  it('isError 未设置时默认为 false', () => {
    const mcpResult = {
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
    }

    const { isError } = unwrapMcpResult(mcpResult)
    expect(isError).toBe(false)
  })
})

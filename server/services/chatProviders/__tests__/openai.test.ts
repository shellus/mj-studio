
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openaiChatProvider } from '../openaiChat'
import { mockHistoryMessages, mockUserMessage, mockUserFiles, mockAssistantMessageWithTools, mockToolCalls } from '../../../../tests/fixtures/mock-data'
import type { Upstream } from '../../database/schema'
import * as fileUtils from '../../file'
import * as upstreamService from '../../upstream'

// Mock dependencies
vi.mock('../../file', () => ({
  readFileAsBase64: vi.fn(),
  isImageMimeType: vi.fn(),
}))

vi.mock('../../upstream', () => ({
  useUpstreamService: vi.fn(),
}))

vi.mock('../../utils/logger', () => ({
  logRequest: vi.fn(),
  logResponse: vi.fn(),
  logError: vi.fn(),
  logComplete: vi.fn(),
  calcSize: vi.fn().mockReturnValue(100),
}))

vi.mock('../../utils/httpLogger', () => ({
  logConversationRequest: vi.fn(),
  logConversationResponse: vi.fn(),
}))

describe('OpenAI Chat Provider', () => {
  const mockUpstream: Upstream = {
    id: 1,
    userId: 1,
    name: 'Test OpenAI',
    baseUrl: 'https://api.openai.com',
    apiKeys: [{ name: 'default', key: 'sk-test' }],
    upstreamPlatform: null,
    userApiKey: null,
    upstreamInfo: null,
    remark: null,
    sortOrder: 0,
    disabled: false,
    createdAt: new Date(),
    deletedAt: null,
  }

  const mockUpstreamService = {
    getApiKey: vi.fn().mockReturnValue('sk-test'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upstreamService.useUpstreamService).mockReturnValue(mockUpstreamService as any)
    vi.mocked(fileUtils.isImageMimeType).mockImplementation((mime) => mime.startsWith('image/'))
    vi.mocked(fileUtils.readFileAsBase64).mockReturnValue('data:image/png;base64,mockbase64data')
    global.fetch = vi.fn()
  })

  describe('buildMessages', () => {
    it('should build messages correctly with text only', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      })
      global.fetch = fetchMock

      await service.chat('gpt-4', 'system prompt', mockHistoryMessages, mockUserMessage)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.messages).toHaveLength(4) // system + 2 history + 1 user
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toBe('system prompt')
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content).toBe('你好')
    })

    it('should build messages with images', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      })
      global.fetch = fetchMock

      await service.chat('gpt-4-vision', null, [], mockUserMessage, mockUserFiles)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      const lastMessage = body.messages[0]

      expect(lastMessage.role).toBe('user')
      expect(Array.isArray(lastMessage.content)).toBe(true)
      // Text + Image
      expect(lastMessage.content).toHaveLength(2)
      expect(lastMessage.content[0].type).toBe('text')
      expect(lastMessage.content[1].type).toBe('image_url')
      expect(lastMessage.content[1].image_url.url).toBe('data:image/png;base64,mockbase64data')
    })

    it('should handle assistant messages with tool calls', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      })
      global.fetch = fetchMock

      const historyWithTools = [mockAssistantMessageWithTools]
      await service.chat('gpt-4', null, historyWithTools, 'next')

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      // 1. Assistant message with tool_calls
      // 2. Tool message (response)
      // 3. User message 'next'
      expect(body.messages).toHaveLength(3)

      const assistantMsg = body.messages[0]
      expect(assistantMsg.role).toBe('assistant')
      expect(assistantMsg.tool_calls).toHaveLength(1)
      expect(assistantMsg.tool_calls[0].id).toBe(mockToolCalls[0].id)
      expect(assistantMsg.tool_calls[0].function.name).toBe(mockToolCalls[0].displayName)

      const toolMsg = body.messages[1]
      expect(toolMsg.role).toBe('tool')
      expect(toolMsg.tool_call_id).toBe(mockToolCalls[0].id)
      expect(toolMsg.content).toBe(JSON.stringify(mockToolCalls[0].response))
    })
  })

  describe('parseStreamChunk', () => {
    async function consumeGenerator(generator: AsyncGenerator<any>) {
      const chunks = []
      for await (const chunk of generator) {
        chunks.push(chunk)
      }
      return chunks
    }

    function createStreamResponse(chunks: string[]) {
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk)))
          controller.close()
        }
      })
      return new Response(stream)
    }

    it('should parse text deltas', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4', null, [], 'hi')
      const chunks = await consumeGenerator(generator)

      const textChunks = chunks.filter(c => c.content).map(c => c.content)
      expect(textChunks.join('')).toBe('Hello World')

      const stopChunk = chunks.find(c => c.stopReason)
      expect(stopChunk?.stopReason).toBe('end_turn')
    })

    it('should parse tool calls', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      // Split tool call into multiple chunks to test accumulation
      const sseData = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":\\"NY\\"}"} } ]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4', null, [], 'weather')
      const chunks = await consumeGenerator(generator)

      const toolUseChunk = chunks.find(c => c.toolUse)
      expect(toolUseChunk).toBeDefined()
      expect(toolUseChunk?.toolUse?.name).toBe('get_weather')
      // Wait for all chunks to be processed
      expect(toolUseChunk?.toolUse?.input).toEqual({ location: 'NY' })

      const stopChunk = chunks.find(c => c.stopReason === 'tool_use')
      expect(stopChunk).toBeDefined()
    })

    it('should parse reasoning content (o1 model)', async () => {
      const service = openaiChatProvider.createService(mockUpstream)

      const sseData = [
        'data: {"choices":[{"delta":{"reasoning_content":"Thinking..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('o1', null, [], 'solve')
      const chunks = await consumeGenerator(generator)

      const thinking = chunks.filter(c => c.thinking).map(c => c.thinking).join('')
      expect(thinking).toBe('Thinking...')

      const content = chunks.filter(c => c.content).map(c => c.content).join('')
      expect(content).toBe('Answer')
    })
  })
})

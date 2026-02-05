
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claudeProvider } from '../claude'
import { mockHistoryMessages, mockUserMessage, mockUserFiles, mockAssistantMessageWithTools, mockToolCalls } from '../../../../tests/fixtures/mock-data'
import type { Upstream } from '../../database/schema'
import * as fileUtils from '../../file'
import * as upstreamService from '../../upstream'

// Mock dependencies
vi.mock('../../file', () => ({
  readFileAsBase64: vi.fn(),
  isImageMimeType: vi.fn(),
  isNativeImageMimeType: vi.fn(),
  isPdfMimeType: vi.fn(),
  readFileAsText: vi.fn(),
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

describe('Claude Provider', () => {
  const mockUpstream: Upstream = {
    id: 1,
    userId: 1,
    name: 'Test Claude',
    baseUrl: 'https://api.anthropic.com',
    apiKeys: [{ name: 'default', key: 'sk-ant-test' }],
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
    getApiKey: vi.fn().mockReturnValue('sk-ant-test'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upstreamService.useUpstreamService).mockReturnValue(mockUpstreamService as any)
    vi.mocked(fileUtils.isImageMimeType).mockImplementation((mime) => mime.startsWith('image/'))
    vi.mocked(fileUtils.isNativeImageMimeType).mockImplementation((mime) => mime.startsWith('image/') && mime !== 'image/svg+xml')
    vi.mocked(fileUtils.isPdfMimeType).mockImplementation((mime) => mime === 'application/pdf')
    vi.mocked(fileUtils.readFileAsBase64).mockReturnValue('data:image/png;base64,mockbase64data')
    vi.mocked(fileUtils.readFileAsText).mockReturnValue(null)

    // Reset global fetch mock
    global.fetch = vi.fn()
  })

  describe('buildMessages', () => {
    it('should build messages correctly with text only', async () => {
      const service = claudeProvider.createService(mockUpstream)

      // Mock fetch to capture the request body
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [] }),
      })
      global.fetch = fetchMock

      await service.chat('claude-3-opus', null, mockHistoryMessages, mockUserMessage)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.messages).toHaveLength(3)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBe('你好')
      expect(body.messages[1].role).toBe('assistant')
      expect(body.messages[1].content).toBe('你好！有什么我可以帮你的吗？')
      expect(body.messages[2].role).toBe('user')
      expect(body.messages[2].content).toBe('帮我画一只猫')
    })

    it('should build messages with images', async () => {
      const service = claudeProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [] }),
      })
      global.fetch = fetchMock

      await service.chat('claude-3-opus', null, [], mockUserMessage, mockUserFiles)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      const lastMessage = body.messages[0]

      expect(lastMessage.role).toBe('user')
      expect(Array.isArray(lastMessage.content)).toBe(true)
      expect(lastMessage.content).toHaveLength(2)
      // Claude puts images before text
      expect(lastMessage.content[0].type).toBe('image')
      expect(lastMessage.content[0].source.type).toBe('base64')
      expect(lastMessage.content[0].source.media_type).toBe('image/png')
      expect(lastMessage.content[0].source.data).toBe('mockbase64data')
      expect(lastMessage.content[1].type).toBe('text')
      expect(lastMessage.content[1].text).toBe(mockUserMessage)
    })

    it('should handle assistant messages with tool calls', async () => {
      const service = claudeProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [] }),
      })
      global.fetch = fetchMock

      // Mock history with tool call
      const historyWithTools = [mockAssistantMessageWithTools]

      await service.chat('claude-3-opus', null, historyWithTools, 'next')

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      // Should have assistant message with tool_use and user message with tool_result
      // Plus the final user message 'next'
      // Wait, buildMessages logic:
      // 1. Assistant message with tool_use
      // 2. User message with tool_result (simulated response)
      // 3. Current user message 'next'

      expect(body.messages).toHaveLength(3)

      // 1. Assistant message
      const assistantMsg = body.messages[0]
      expect(assistantMsg.role).toBe('assistant')
      expect(Array.isArray(assistantMsg.content)).toBe(true)
      expect(assistantMsg.content[0].type).toBe('text')
      expect(assistantMsg.content[1].type).toBe('tool_use')
      expect(assistantMsg.content[1].id).toBe(mockToolCalls[0].id)

      // 2. Tool result (User role)
      const toolResultMsg = body.messages[1]
      expect(toolResultMsg.role).toBe('user')
      expect(Array.isArray(toolResultMsg.content)).toBe(true)
      expect(toolResultMsg.content[0].type).toBe('tool_result')
      expect(toolResultMsg.content[0].tool_use_id).toBe(mockToolCalls[0].id)

      // 3. User message
      expect(body.messages[2].role).toBe('user')
      expect(body.messages[2].content).toBe('next')
    })
  })

  describe('parseStreamChunk', () => {
    // Helper to consume generator
    async function consumeGenerator(generator: AsyncGenerator<any>) {
      const chunks = []
      for await (const chunk of generator) {
        chunks.push(chunk)
      }
      return chunks
    }

    // Helper to create a stream response
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
      const service = claudeProvider.createService(mockUpstream)

      const sseData = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","role":"assistant"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('claude-3-opus', null, [], 'hi')
      const chunks = await consumeGenerator(generator)

      const textChunks = chunks.filter(c => c.content).map(c => c.content)
      expect(textChunks.join('')).toBe('Hello World')

      // Verify stop reason
      const stopChunk = chunks.find(c => c.stopReason)
      expect(stopChunk).toBeDefined()
      expect(stopChunk?.stopReason).toBe('end_turn')

      // Verify done
      const doneChunk = chunks.find(c => c.done)
      expect(doneChunk).toBeDefined()
    })

    it('should parse tool use', async () => {
      const service = claudeProvider.createService(mockUpstream)

      const sseData = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","role":"assistant"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"get_weather","input":{}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"location\\":"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"London\\"}"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('claude-3-opus', null, [], 'weather')
      const chunks = await consumeGenerator(generator)

      const toolUseChunk = chunks.find(c => c.toolUse)
      expect(toolUseChunk).toBeDefined()
      expect(toolUseChunk?.toolUse?.name).toBe('get_weather')
      expect(toolUseChunk?.toolUse?.input).toEqual({ location: 'London' })

      const stopChunk = chunks.find(c => c.stopReason === 'tool_use')
      expect(stopChunk).toBeDefined()
    })

    it('should parse thinking blocks', async () => {
      const service = claudeProvider.createService(mockUpstream)

      const sseData = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Thinking..."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('claude-3-opus', null, [], 'think', undefined, undefined, undefined, undefined, undefined, true)
      const chunks = await consumeGenerator(generator)

      const thinkingChunks = chunks.filter(c => c.thinking).map(c => c.thinking)
      expect(thinkingChunks.join('')).toBe('Thinking...')
    })
  })
})

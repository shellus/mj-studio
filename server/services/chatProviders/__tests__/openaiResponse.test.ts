
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openaiResponseProvider } from '../openaiResponse'
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
  logCompressRequest: vi.fn(),
  logResponse: vi.fn(),
  logError: vi.fn(),
  logComplete: vi.fn(),
  calcSize: vi.fn().mockReturnValue(100),
}))

vi.mock('../../utils/httpLogger', () => ({
  logConversationRequest: vi.fn(),
  logConversationResponse: vi.fn(),
}))

describe('OpenAI Response Provider', () => {
  const mockUpstream: Upstream = {
    id: 1,
    userId: 1,
    name: 'Test OpenAI Response',
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
    vi.mocked(fileUtils.isNativeImageMimeType).mockImplementation((mime) => mime.startsWith('image/') && mime !== 'image/svg+xml')
    vi.mocked(fileUtils.isPdfMimeType).mockImplementation((mime) => mime === 'application/pdf')
    vi.mocked(fileUtils.readFileAsBase64).mockReturnValue('data:image/png;base64,mockbase64data')
    vi.mocked(fileUtils.readFileAsText).mockReturnValue(null)
    global.fetch = vi.fn()
  })

  describe('buildRequestBody (via chat method)', () => {
    it('should build request body correctly with text only', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ output: [{ content: [{ text: 'response' }] }] }),
      })
      global.fetch = fetchMock

      await service.chat('gpt-4o', 'system prompt', mockHistoryMessages, mockUserMessage)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      // Response API uses 'input' instead of 'messages'
      expect(body.input).toHaveLength(3) // 2 history + 1 user
      expect(body.instructions).toBe('system prompt')
      expect(body.model).toBe('gpt-4o')
      expect(body.stream).toBe(false)

      // First message is user
      expect(body.input[0].role).toBe('user')
      expect(body.input[0].content).toBe('你好')

      // Second message is assistant
      expect(body.input[1].role).toBe('assistant')
      expect(body.input[1].content).toBe('你好！有什么我可以帮你的吗？')

      // Current user message
      expect(body.input[2].role).toBe('user')
      expect(body.input[2].content).toBe('帮我画一只猫')
    })

    it('should build request body with images', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ output: [{ content: [{ text: 'response' }] }] }),
      })
      global.fetch = fetchMock

      await service.chat('gpt-4o', null, [], mockUserMessage, mockUserFiles)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      const userMessage = body.input[0]

      expect(userMessage.role).toBe('user')
      expect(Array.isArray(userMessage.content)).toBe(true)
      // Text + Image
      expect(userMessage.content).toHaveLength(2)
      expect(userMessage.content[0].type).toBe('input_text')
      expect(userMessage.content[0].text).toBe(mockUserMessage)
      expect(userMessage.content[1].type).toBe('input_image')
      expect(userMessage.content[1].image_url).toBe('data:image/png;base64,mockbase64data')
    })

    it('should handle assistant messages with tool calls', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ output: [{ content: [{ text: 'response' }] }] }),
      })
      global.fetch = fetchMock

      const historyWithTools = [mockAssistantMessageWithTools]
      await service.chat('gpt-4o', null, historyWithTools, 'next')

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      // Response API format:
      // 1. Assistant text content
      // 2. function_call
      // 3. function_call_output
      // 4. User message 'next'
      expect(body.input).toHaveLength(4)

      // Assistant text
      const assistantMsg = body.input[0]
      expect(assistantMsg.role).toBe('assistant')
      expect(assistantMsg.content).toBe('好的，我来帮你查一下。')

      // function_call
      const functionCall = body.input[1]
      expect(functionCall.type).toBe('function_call')
      expect(functionCall.call_id).toBe(mockToolCalls[0].id)
      expect(functionCall.name).toBe(mockToolCalls[0].displayName)

      // function_call_output
      const functionOutput = body.input[2]
      expect(functionOutput.type).toBe('function_call_output')
      expect(functionOutput.call_id).toBe(mockToolCalls[0].id)
      expect(functionOutput.output).toBe(JSON.stringify(mockToolCalls[0].response))

      // User message
      expect(body.input[3].role).toBe('user')
      expect(body.input[3].content).toBe('next')
    })

    it('should not include instructions field when system prompt is null', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ output: [{ content: [{ text: 'response' }] }] }),
      })
      global.fetch = fetchMock

      await service.chat('gpt-4o', null, [], mockUserMessage)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.instructions).toBeUndefined()
    })
  })

  describe('buildRequestBody with web search (via chatStream)', () => {
    it('should include web_search_preview tool when enabled', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          }
        }),
      })
      global.fetch = fetchMock

      const generator = service.chatStream('gpt-4o', null, [], 'search something', undefined, undefined, undefined, undefined, undefined, false, true)
      // Consume generator
      for await (const _ of generator) { /* consume */ }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.tools).toBeDefined()
      expect(body.tools).toContainEqual({ type: 'web_search_preview' })
    })

    it('should include MCP tools when provided', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          }
        }),
      })
      global.fetch = fetchMock

      const tools = [
        {
          name: 'get_weather',
          description: 'Get weather for a location',
          inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
        },
      ]

      const generator = service.chatStream('gpt-4o', null, [], 'weather', undefined, undefined, undefined, undefined, undefined, false, false, tools)
      for await (const _ of generator) { /* consume */ }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.tools).toBeDefined()
      expect(body.tools).toHaveLength(1)
      expect(body.tools[0].type).toBe('function')
      expect(body.tools[0].name).toBe('get_weather')
      expect(body.tools[0].description).toBe('Get weather for a location')
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
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
        'data: {"type":"response.output_text.delta","delta":" World"}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4o', null, [], 'hi')
      const chunks = await consumeGenerator(generator)

      const textChunks = chunks.filter(c => c.content).map(c => c.content)
      expect(textChunks.join('')).toBe('Hello World')

      const doneChunk = chunks.find(c => c.done)
      expect(doneChunk).toBeDefined()
    })

    it('should parse reasoning/thinking deltas', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.reasoning_summary_text.delta","delta":"Thinking step 1..."}\n\n',
        'data: {"type":"response.reasoning_summary_text.delta","delta":" Step 2..."}\n\n',
        'data: {"type":"response.output_text.delta","delta":"Answer"}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('o3-mini', null, [], 'solve', undefined, undefined, undefined, undefined, undefined, true)
      const chunks = await consumeGenerator(generator)

      const thinking = chunks.filter(c => c.thinking).map(c => c.thinking).join('')
      expect(thinking).toBe('Thinking step 1... Step 2...')

      const content = chunks.filter(c => c.content).map(c => c.content).join('')
      expect(content).toBe('Answer')
    })

    it('should parse function call arguments done event', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.function_call_arguments.done","call_id":"call_abc","name":"get_weather","arguments":"{\\"location\\":\\"London\\"}"}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4o', null, [], 'weather')
      const chunks = await consumeGenerator(generator)

      const toolUseChunk = chunks.find(c => c.toolUse)
      expect(toolUseChunk).toBeDefined()
      expect(toolUseChunk?.toolUse?.id).toBe('call_abc')
      expect(toolUseChunk?.toolUse?.name).toBe('get_weather')
      expect(toolUseChunk?.toolUse?.input).toEqual({ location: 'London' })
    })

    it('should parse function call from output_item.done event', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_xyz","name":"search","arguments":"{\\"query\\":\\"test\\"}"}}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4o', null, [], 'search')
      const chunks = await consumeGenerator(generator)

      const toolUseChunk = chunks.find(c => c.toolUse)
      expect(toolUseChunk).toBeDefined()
      expect(toolUseChunk?.toolUse?.id).toBe('call_xyz')
      expect(toolUseChunk?.toolUse?.name).toBe('search')
      expect(toolUseChunk?.toolUse?.input).toEqual({ query: 'test' })
    })

    it('should parse web search events', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.web_search_call.in_progress"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"Based on search..."}\n\n',
        'data: {"type":"response.output_text.annotation.added","annotation":{"type":"url_citation","url":"https://example.com","title":"Example"}}\n\n',
        'data: {"type":"response.web_search_call.completed"}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4o', null, [], 'search', undefined, undefined, undefined, undefined, undefined, false, true)
      const chunks = await consumeGenerator(generator)

      // Check web search status
      const searchingChunk = chunks.find(c => c.webSearch?.status === 'searching')
      expect(searchingChunk).toBeDefined()

      const content = chunks.filter(c => c.content).map(c => c.content).join('')
      expect(content).toBe('Based on search...')
    })

    it('should handle response.completed with tool_use stop reason', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      const sseData = [
        'data: {"type":"response.function_call_arguments.done","call_id":"call_1","name":"test_tool","arguments":"{}"}\n\n',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"function_call"}]}}\n\n',
        'data: [DONE]\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gpt-4o', null, [], 'use tool')
      const chunks = await consumeGenerator(generator)

      const stopChunk = chunks.find(c => c.stopReason === 'tool_use')
      expect(stopChunk).toBeDefined()
    })

    it('should handle HTTP errors', async () => {
      const service = openaiResponseProvider.createService(mockUpstream)

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{"error":{"message":"Invalid API key"}}',
      })

      const generator = service.chatStream('gpt-4o', null, [], 'hi')

      await expect(async () => {
        for await (const _ of generator) { /* consume */ }
      }).rejects.toThrow('Invalid API key')
    })
  })
})


import { describe, it, expect, vi, beforeEach } from 'vitest'
import { geminiProvider } from '../gemini'
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

describe('Gemini Provider', () => {
  const mockUpstream: Upstream = {
    id: 1,
    userId: 1,
    name: 'Test Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeys: [{ name: 'default', key: 'AIzaSyTest' }],
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
    getApiKey: vi.fn().mockReturnValue('AIzaSyTest'),
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
      const service = geminiProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'response' }] } }] }),
      })
      global.fetch = fetchMock

      await service.chat('gemini-pro', null, mockHistoryMessages, mockUserMessage)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      expect(body.contents).toHaveLength(3)
      expect(body.contents[0].role).toBe('user')
      expect(body.contents[0].parts[0].text).toBe('你好')
      expect(body.contents[1].role).toBe('model') // Gemini uses 'model' instead of 'assistant'
      expect(body.contents[1].parts[0].text).toBe('你好！有什么我可以帮你的吗？')
      expect(body.contents[2].role).toBe('user')
      expect(body.contents[2].parts[0].text).toBe('帮我画一只猫')
    })

    it('should build messages with images', async () => {
      const service = geminiProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'response' }] } }] }),
      })
      global.fetch = fetchMock

      await service.chat('gemini-pro-vision', null, [], mockUserMessage, mockUserFiles)

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      const lastMessage = body.contents[0]

      expect(lastMessage.role).toBe('user')
      // Gemini puts images before text
      expect(lastMessage.parts).toHaveLength(2)
      expect(lastMessage.parts[0].inlineData.mimeType).toBe('image/png')
      expect(lastMessage.parts[0].inlineData.data).toBe('mockbase64data')
      expect(lastMessage.parts[1].text).toBe(mockUserMessage)
    })

    it('should handle assistant messages with tool calls', async () => {
      const service = geminiProvider.createService(mockUpstream)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'response' }] } }] }),
      })
      global.fetch = fetchMock

      const historyWithTools = [mockAssistantMessageWithTools]
      await service.chat('gemini-pro', null, historyWithTools, 'next')

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call[1].body as string)

      // 1. Model message (text + functionCall)
      // 2. User message (functionResponse)
      // 3. User message 'next'
      expect(body.contents).toHaveLength(3)

      const modelMsg = body.contents[0]
      expect(modelMsg.role).toBe('model')
      expect(modelMsg.parts[0].text).toBe(mockAssistantMessageWithTools.content)
      expect(modelMsg.parts[1].functionCall.name).toBe(mockToolCalls[0].displayName)

      const functionRespMsg = body.contents[1]
      expect(functionRespMsg.role).toBe('user')
      expect(functionRespMsg.parts[0].functionResponse.name).toBe(mockToolCalls[0].displayName)
      expect(functionRespMsg.parts[0].functionResponse.response.content).toEqual(mockToolCalls[0].response)
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
      const service = geminiProvider.createService(mockUpstream)

      // Gemini streaming response structure
      const sseData = [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }) + '\n\n',
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: ' World' }] } }] }) + '\n\n',
        'data: ' + JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }) + '\n\n',
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gemini-pro', null, [], 'hi')
      const chunks = await consumeGenerator(generator)

      const textChunks = chunks.filter(c => c.content).map(c => c.content)
      expect(textChunks.join('')).toBe('Hello World')

      const stopChunk = chunks.find(c => c.stopReason)
      expect(stopChunk?.stopReason).toBe('end_turn')
    })

    it('should parse function calls', async () => {
      const service = geminiProvider.createService(mockUpstream)

      const sseData = [
        'data: ' + JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'get_weather',
                  args: { location: 'London' }
                }
              }]
            },
            finishReason: 'TOOL_CALL' // Can be sent in same or subsequent chunk
          }]
        }) + '\n\n'
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gemini-pro', null, [], 'weather')
      const chunks = await consumeGenerator(generator)

      const toolUseChunk = chunks.find(c => c.toolUse)
      expect(toolUseChunk).toBeDefined()
      expect(toolUseChunk?.toolUse?.name).toBe('get_weather')
      expect(toolUseChunk?.toolUse?.input).toEqual({ location: 'London' })
    })

    it('should parse thinking content (Gemini 2.0)', async () => {
      const service = geminiProvider.createService(mockUpstream)

      const sseData = [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Thinking...', thought: true }] } }] }) + '\n\n',
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Answer', thought: false }] } }] }) + '\n\n',
      ]

      global.fetch = vi.fn().mockResolvedValue(createStreamResponse(sseData))

      const generator = service.chatStream('gemini-2.0-flash-thinking', null, [], 'solve')
      const chunks = await consumeGenerator(generator)

      const thinking = chunks.filter(c => c.thinking).map(c => c.thinking).join('')
      expect(thinking).toBe('Thinking...')

      const content = chunks.filter(c => c.content).map(c => c.content).join('')
      expect(content).toBe('Answer')
    })
  })
})

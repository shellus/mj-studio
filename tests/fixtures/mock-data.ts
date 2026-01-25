
// 模拟消息数据
export const mockHistoryMessages = [
  {
    id: 1,
    conversationId: 1,
    role: 'user' as const,
    content: '你好',
    createdAt: new Date(),
  },
  {
    id: 2,
    conversationId: 1,
    role: 'assistant' as const,
    content: '你好！有什么我可以帮你的吗？',
    createdAt: new Date(),
  },
]

export const mockUserMessage = '帮我画一只猫'

export const mockUserFiles = [
  {
    name: 'test.png',
    fileName: 'test-file-name.png',
    mimeType: 'image/png',
    size: 1024,
  },
]

// 模拟工具调用数据
export const mockToolCalls = [
  {
    id: 'call_123',
    serverId: 1,
    serverName: 'test-server',
    toolName: 'test-tool',
    displayName: 'mcp__test-server__test-tool',
    arguments: { query: 'test' },
    status: 'done' as const,
    response: { result: 'success' },
  },
]

export const mockAssistantMessageWithTools = {
  id: 3,
  conversationId: 1,
  role: 'assistant' as const,
  content: '好的，我来帮你查一下。',
  toolCalls: mockToolCalls,
  createdAt: new Date(),
}

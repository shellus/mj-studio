
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mcpClientManager, mcpToolsToChatTools, findMcpToolByDisplayName } from '../index'
import { McpClientInstance } from '../instance'
import type { McpServer } from '../../database/schema'

// Define the mock client methods
const mockConnect = vi.fn()
const mockClose = vi.fn()
const mockListTools = vi.fn()
const mockCallTool = vi.fn()

// Define the mock client instance
const mockClientInstance = {
  connect: mockConnect,
  close: mockClose,
  listTools: mockListTools,
  callTool: mockCallTool,
}

// Mock SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn(function() {
      return {
        connect: mockConnect,
        close: mockClose,
        listTools: mockListTools,
        callTool: mockCallTool,
      }
    })
  }
})

// Import Client to verify calls if needed (though we check the instance methods)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

vi.mock('../transports', () => ({
  createTransport: vi.fn(),
  getTransportDescription: vi.fn().mockReturnValue('mock-transport'),
}))

describe('MCP Lifecycle Integration', () => {
  const mockServer: McpServer = {
    id: 1,
    userId: 1,
    name: 'test-server',
    type: 'sse',
    baseUrl: 'http://localhost:3000/sse',
    command: null,
    args: null,
    env: null,
    headers: null,
    isActive: true,
    disabledTools: [],
    autoApproveTools: [],
    remark: null,
    createdAt: new Date(),
    deletedAt: null,
  }

  const mockTool = {
    name: 'test-tool',
    description: 'A test tool',
    inputSchema: { type: 'object' },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock behaviors
    mockConnect.mockResolvedValue(undefined)
    mockClose.mockResolvedValue(undefined)
    mockListTools.mockResolvedValue({ tools: [mockTool] })
    mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'tool result' }] })
  })

  afterEach(async () => {
    await mcpClientManager.disconnectAll(1)
  })

  it('should handle full lifecycle of MCP tool usage', async () => {
    // 1. Tool Discovery
    const tools = await mcpClientManager.getToolsForServers(1, [mockServer])

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('test-tool')
    expect(tools[0].serverId).toBe(1)
    expect(tools[0].displayName).toContain('mcp__test_server__test_tool')

    // 2. Tool Conversion to Chat Format
    const chatTools = mcpToolsToChatTools(tools)
    expect(chatTools).toHaveLength(1)
    expect(chatTools[0].name).toBe(tools[0].displayName)
    expect(chatTools[0].inputSchema).toEqual(mockTool.inputSchema)

    // 3. Tool Lookup
    const toolName = chatTools[0].name
    const foundTool = findMcpToolByDisplayName(tools, toolName)
    expect(foundTool).toBeDefined()
    expect(foundTool?.name).toBe('test-tool')

    // 4. Tool Execution
    const result = await mcpClientManager.callTool(1, mockServer, 'test-tool', { arg: 'val' })

    expect(result.success).toBe(true)
    expect(result.content).toBe('tool result')
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'test-tool',
      arguments: { arg: 'val' },
    })

    // Verify connection reuse
    expect(mockConnect).toHaveBeenCalledTimes(1) // Only once for discovery
  })

  it('should handle tool execution errors gracefully', async () => {
    mockCallTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'Error occurred' }],
    })

    const result = await mcpClientManager.callTool(1, mockServer, 'test-tool', {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('Error occurred')
  })

  it('should handle server connection failures', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'))

    const result = await mcpClientManager.testConnection(1, mockServer)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection failed')
  })

  it('should auto-reconnect on tool call if disconnected', async () => {
    // First connect
    await mcpClientManager.getClient(1, mockServer)
    expect(mockConnect).toHaveBeenCalledTimes(1)

    // Simulate disconnect
    await mcpClientManager.disconnect(1, 1)

    // Call tool should trigger reconnect
    await mcpClientManager.callTool(1, mockServer, 'test-tool', {})

    // Should have connected again
    // Note: disconnect() calls close()
    expect(mockClose).toHaveBeenCalledTimes(1)

    // Connect called twice total (initial + reconnect)
    expect(mockConnect).toHaveBeenCalledTimes(2)
  })
})

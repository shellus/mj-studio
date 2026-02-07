/**
 * MCP 接口集成测试
 *
 * 测试 MCP 协议接口，包括：
 * - MCP 认证（API Key）
 * - 工具列表查询
 * - 各个工具的调用
 *
 * 运行测试前需要：
 * 1. 启动开发服务器: pnpm dev
 * 2. 配置 .env 中的测试变量:
 *    - TEST_MCP_API_KEY (格式: mjs_xxx)
 *
 * 运行命令：
 *   pnpm test tests/mcp-integration.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = 'http://localhost:3000'
const MCP_ENDPOINT = `${BASE_URL}/api/mcp`

// 从环境变量读取 MCP API Key
const MCP_API_KEY = process.env.TEST_MCP_API_KEY || ''

// 存储 MCP 会话 ID
let sessionId = ''

// 请求 ID 计数器
let requestId = 0

// 辅助函数：发起 MCP 请求
async function mcpRequest(method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${MCP_API_KEY}`,
  }

  if (sessionId) {
    headers['mcp-session-id'] = sessionId
  }

  requestId++
  const body = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId,
  }

  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  // 提取 session ID
  const newSessionId = response.headers.get('mcp-session-id')
  if (newSessionId) {
    sessionId = newSessionId
  }

  // 解析 SSE 响应
  const text = await response.text()

  // SSE 格式: event: message\ndata: {...}\n\n
  const dataMatch = text.match(/data: (.+)/)
  if (dataMatch) {
    return JSON.parse(dataMatch[1])
  }

  // 直接 JSON 响应（错误情况）
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`无法解析响应: ${text}`)
  }
}

// 辅助函数：调用 MCP 工具
async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await mcpRequest('tools/call', { name, arguments: args })

  if (response.error) {
    throw new Error(`工具调用失败: ${JSON.stringify(response.error)}`)
  }

  // 解析工具返回的 JSON 文本
  const content = response.result?.content?.[0]
  if (content?.type === 'text') {
    try {
      return JSON.parse(content.text)
    } catch {
      return content.text
    }
  }

  return response.result
}

// ==================== 前置检查 ====================

beforeAll(() => {
  if (!MCP_API_KEY) {
    console.warn('⚠️ 未配置 TEST_MCP_API_KEY 环境变量，MCP 测试将被跳过')
    console.warn('请在 .env 中配置: TEST_MCP_API_KEY=mjs_xxx')
  }
})

// ==================== MCP 认证 ====================

describe('MCP 认证', () => {
  it('无效 API Key 应返回 401', async () => {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': 'Bearer invalid_key',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1,
      }),
    })

    expect(response.status).toBe(401)
  })

  it('无 Authorization 头应返回 401', async () => {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1,
      }),
    })

    expect(response.status).toBe(401)
  })
})

// ==================== MCP 协议 ====================

describe('MCP 协议', () => {
  it('应能初始化 MCP 会话', async () => {
    if (!MCP_API_KEY) {
      console.log('跳过：未配置 MCP API Key')
      return
    }

    const response = await mcpRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '1.0' },
    })

    console.log('MCP 初始化响应:', JSON.stringify(response, null, 2))

    expect(response.result).toBeDefined()
    expect(response.result.protocolVersion).toBe('2024-11-05')
    expect(response.result.serverInfo.name).toBe('mj-studio')
    expect(sessionId).toBeTruthy()

    console.log('MCP 会话 ID:', sessionId)
  })

  it('应能获取工具列表', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const response = await mcpRequest('tools/list', {})

    console.log('工具数量:', response.result?.tools?.length)

    expect(response.result).toBeDefined()
    expect(response.result.tools).toBeDefined()
    expect(Array.isArray(response.result.tools)).toBe(true)

    // 验证工具列表包含预期的工具
    const toolNames = response.result.tools.map((t: { name: string }) => t.name)
    console.log('可用工具:', toolNames.join(', '))

    expect(toolNames).toContain('list_models')
    expect(toolNames).toContain('list_assistants')
    expect(toolNames).toContain('list_conversations')
    expect(toolNames).toContain('get_conversation')
    expect(toolNames).toContain('chat')
    expect(toolNames).toContain('generate_image')
    expect(toolNames).toContain('generate_video')
    expect(toolNames).toContain('get_task')
    expect(toolNames).toContain('list_tasks')
    expect(toolNames).toContain('get_upload_url')
  })
})

// ==================== 文件上传工具 ====================

describe('文件上传工具', () => {
  let uploadUrl = ''
  let uploadToken = ''

  it('get_upload_url 应返回上传信息', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('get_upload_url', {})

    expect(result.uploadUrl).toBeDefined()
    expect(result.method).toBe('POST')
    expect(result.headers).toBeDefined()
    expect(result.headers.Authorization).toMatch(/^Bearer /)
    expect(result.fieldName).toBe('file')
    expect(result.curlExample).toBeDefined()
    expect(result.expiresIn).toBe('10 minutes')

    uploadUrl = result.uploadUrl
    uploadToken = result.headers.Authorization.replace('Bearer ', '')

    console.log('上传 URL:', uploadUrl)
  })

  it('使用临时 JWT 上传文件应成功', async () => {
    if (!uploadUrl || !uploadToken) {
      console.log('跳过：未获取到上传 URL')
      return
    }

    // 构造一个最小的 PNG 文件（1x1 像素透明 PNG）
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, // RGBA, CRC
      0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
      0xE5, 0x27, 0xDE, 0xFC,                           // CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82,                           // CRC
    ])

    const boundary = '----TestBoundary' + Date.now()
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),
      pngHeader,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${uploadToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    const data = await response.json()
    console.log('上传结果:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.url).toBeDefined()
    expect(data.url).toContain('/api/files/')
  })
})

// ==================== 查询工具 ====================

describe('查询工具', () => {
  it('list_models 应返回模型列表', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('list_models', {})

    console.log('模型数量:', result.models?.length)

    expect(result.models).toBeDefined()
    expect(Array.isArray(result.models)).toBe(true)

    if (result.models.length > 0) {
      const model = result.models[0]
      expect(model.aimodelId).toBeDefined()
      expect(model.name).toBeDefined()
      expect(model.category).toBeDefined()
      console.log('首个模型:', model.name, `(${model.category})`)
    }
  })

  it('list_models 应支持分类过滤', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const imageModels = await callTool('list_models', { category: 'image' })
    const chatModels = await callTool('list_models', { category: 'chat' })

    console.log('图片模型数量:', imageModels.models?.length)
    console.log('对话模型数量:', chatModels.models?.length)

    // 验证分类过滤生效
    if (imageModels.models?.length > 0) {
      expect(imageModels.models.every((m: { category: string }) => m.category === 'image')).toBe(true)
    }
    if (chatModels.models?.length > 0) {
      expect(chatModels.models.every((m: { category: string }) => m.category === 'chat')).toBe(true)
    }
  })

  it('list_assistants 应返回助手列表', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('list_assistants', {})

    console.log('助手数量:', result.assistants?.length)

    expect(result.assistants).toBeDefined()
    expect(Array.isArray(result.assistants)).toBe(true)

    if (result.assistants.length > 0) {
      const assistant = result.assistants[0]
      expect(assistant.id).toBeDefined()
      expect(assistant.name).toBeDefined()
      expect(typeof assistant.conversationCount).toBe('number')
      console.log('首个助手:', assistant.name, `(${assistant.conversationCount} 对话)`)
    }
  })

  it('list_tasks 应返回任务列表', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('list_tasks', { limit: 5 })

    console.log('任务数量:', result.tasks?.length, '/', result.total)

    expect(result.tasks).toBeDefined()
    expect(Array.isArray(result.tasks)).toBe(true)
    expect(typeof result.total).toBe('number')

    if (result.tasks.length > 0) {
      const task = result.tasks[0]
      expect(task.taskId).toBeDefined()
      expect(task.taskType).toBeDefined()
      expect(task.status).toBeDefined()
      console.log('首个任务:', task.taskId, `(${task.taskType}, ${task.status})`)
    }
  })

  it('list_tasks 应支持过滤', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const imageTasks = await callTool('list_tasks', { taskType: 'image', limit: 5 })
    const successTasks = await callTool('list_tasks', { status: 'success', limit: 5 })

    console.log('图片任务数量:', imageTasks.tasks?.length)
    console.log('成功任务数量:', successTasks.tasks?.length)

    // 验证过滤生效
    if (imageTasks.tasks?.length > 0) {
      expect(imageTasks.tasks.every((t: { taskType: string }) => t.taskType === 'image')).toBe(true)
    }
    if (successTasks.tasks?.length > 0) {
      expect(successTasks.tasks.every((t: { status: string }) => t.status === 'success')).toBe(true)
    }
  })
})

// ==================== 对话工具 ====================

describe('对话工具', () => {
  let testAssistantId: number | null = null
  let testConversationId: number | null = null

  it('list_conversations 应返回对话列表', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    // 先获取一个助手
    const assistants = await callTool('list_assistants', {})
    if (!assistants.assistants?.length) {
      console.log('跳过：用户没有助手')
      return
    }

    testAssistantId = assistants.assistants[0].id
    console.log('使用助手:', testAssistantId)

    const result = await callTool('list_conversations', {
      assistantId: testAssistantId,
      limit: 5,
    })

    console.log('对话数量:', result.conversations?.length)

    expect(result.conversations).toBeDefined()
    expect(Array.isArray(result.conversations)).toBe(true)

    if (result.conversations.length > 0) {
      const conv = result.conversations[0]
      expect(conv.id).toBeDefined()
      expect(conv.title).toBeDefined()
      expect(typeof conv.messageCount).toBe('number')
      testConversationId = conv.id
      console.log('首个对话:', conv.title, `(${conv.messageCount} 消息)`)
    }
  })

  it('get_conversation 应返回对话详情', async () => {
    if (!MCP_API_KEY || !sessionId || !testConversationId) {
      console.log('跳过：未获取到对话')
      return
    }

    const result = await callTool('get_conversation', {
      conversationId: testConversationId,
    })

    console.log('对话消息数量:', result.messages?.length)

    expect(result.id).toBe(testConversationId)
    expect(result.messages).toBeDefined()
    expect(Array.isArray(result.messages)).toBe(true)

    if (result.messages.length > 0) {
      const msg = result.messages[0]
      expect(msg.id).toBeDefined()
      expect(msg.role).toBeDefined()
      expect(['user', 'assistant']).toContain(msg.role)
      console.log('首条消息:', msg.role, msg.content?.slice(0, 50) + '...')
    }
  })

  it('get_conversation 对不存在的对话应返回错误', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('get_conversation', {
      conversationId: 999999,
    })

    expect(result.error).toBeDefined()
    console.log('预期错误:', result.error)
  })
})

// ==================== 任务工具 ====================

describe('任务工具', () => {
  let testTaskId: number | null = null

  it('get_task 应返回任务详情', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    // 先获取一个任务
    const tasks = await callTool('list_tasks', { limit: 1 })
    if (!tasks.tasks?.length) {
      console.log('跳过：用户没有任务')
      return
    }

    testTaskId = tasks.tasks[0].taskId
    console.log('使用任务:', testTaskId)

    const result = await callTool('get_task', { taskId: testTaskId })

    expect(result.taskId).toBe(testTaskId)
    expect(result.taskType).toBeDefined()
    expect(result.status).toBeDefined()
    expect(result.prompt).toBeDefined()

    console.log('任务详情:', {
      taskId: result.taskId,
      taskType: result.taskType,
      status: result.status,
      prompt: result.prompt?.slice(0, 50) + '...',
      resourceUrl: result.resourceUrl,
    })
  })

  it('get_task 对不存在的任务应返回错误', async () => {
    if (!MCP_API_KEY || !sessionId) {
      console.log('跳过：未初始化 MCP 会话')
      return
    }

    const result = await callTool('get_task', { taskId: 999999 })

    expect(result.error).toBeDefined()
    console.log('预期错误:', result.error)
  })
})

// ==================== 会话管理 ====================

describe('会话管理', () => {
  it('无效会话 ID 应返回错误', async () => {
    if (!MCP_API_KEY) {
      console.log('跳过：未配置 MCP API Key')
      return
    }

    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${MCP_API_KEY}`,
        'mcp-session-id': 'invalid-session-id',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 100,
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('会话')
  })
})

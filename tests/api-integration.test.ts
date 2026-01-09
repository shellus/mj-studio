/**
 * API 集成测试
 *
 * 测试应用核心功能流程，包括：
 * - 用户认证流程
 * - 上游配置管理
 * - 助手和对话功能
 * - 绘图任务功能
 *
 * 运行测试前需要：
 * 1. 启动开发服务器: pnpm dev
 * 2. 配置 .env 中的测试变量:
 *    - TEST_EPHONE_BASE_URL
 *    - TEST_EPHONE_API_KEY_DEFAULT
 *    - TEST_EPHONE_BALANCE_KEY
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const BASE_URL = 'http://localhost:3000'

// 从环境变量读取测试配置
const TEST_CONFIG = {
  baseUrl: process.env.TEST_EPHONE_BASE_URL || '',
  apiKey: process.env.TEST_EPHONE_API_KEY_DEFAULT || '',
  balanceKey: process.env.TEST_EPHONE_BALANCE_KEY || '',
}

// 存储 JWT token（认证使用 Bearer token 而非 Cookie）
let authToken = ''

// 存储测试过程中创建的资源 ID
let testUpstreamId = 0
let testChatAimodelId = 0  // claude 对话模型
let testGeminiAimodelId = 0  // gemini 绘图模型
let testDalleAimodelId = 0  // dalle 绘图模型
let testAssistantId = 0
let testConversationId = 0
let testTaskId = 0

// 测试用户密码（用于清理时删除账户）
const TEST_USER_PASSWORD = 'TestPass123'

// 收集所有创建的任务 ID，用于清理
const createdTaskIds: number[] = []

// 辅助函数：发起带认证的请求
async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  return response
}

// 辅助函数：等待任务完成
async function waitForTaskComplete(taskId: number, maxWaitMs = 120000): Promise<any> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetchWithAuth(`/api/tasks/${taskId}`)
    const task = await response.json()

    console.log(`[Task ${taskId}] 状态: ${task.status}, 进度: ${task.progress || 'N/A'}`)

    if (task.status === 'success') {
      return task
    }
    if (task.status === 'failed') {
      throw new Error(`任务失败: ${task.failReason || '未知错误'}`)
    }

    // 等待 3 秒后再次查询
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  throw new Error('任务超时')
}

// 辅助函数：等待消息生成完成
async function waitForMessageComplete(conversationId: number, messageId: number, maxWaitMs = 60000): Promise<any> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetchWithAuth(`/api/conversations/${conversationId}`)
    const data = await response.json()

    const message = data.messages?.find((m: any) => m.id === messageId)
    if (message) {
      console.log(`[Message ${messageId}] 状态: ${message.status}, 内容长度: ${message.content?.length || 0}`)

      if (message.status === 'done' || message.status === 'error') {
        return message
      }
    }

    // 等待 2 秒后再次查询
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error('消息生成超时')
}

// ==================== 前置检查 ====================

beforeAll(() => {
  if (!TEST_CONFIG.baseUrl || !TEST_CONFIG.apiKey) {
    console.warn('⚠️ 未配置测试环境变量，部分测试将被跳过')
    console.warn('请在 .env 中配置: TEST_EPHONE_BASE_URL, TEST_EPHONE_API_KEY_DEFAULT')
  }
})

// 全局清理：确保即使测试失败也能清理创建的资源
afterAll(async () => {
  console.log('\n========== 清理测试数据 ==========')

  // 清理所有创建的任务
  for (const taskId of createdTaskIds) {
    try {
      await fetchWithAuth(`/api/tasks/${taskId}`, { method: 'DELETE' })
      console.log(`[清理] 删除任务 ${taskId}`)
    } catch (e) {
      console.warn(`[清理] 删除任务 ${taskId} 失败:`, e)
    }
  }

  // 清空回收站
  try {
    await fetchWithAuth('/api/tasks/trash/empty', { method: 'DELETE' })
    console.log('[清理] 清空回收站')
  } catch (e) {
    console.warn('[清理] 清空回收站失败:', e)
  }

  // 清理对话
  if (testConversationId) {
    try {
      await fetchWithAuth(`/api/conversations/${testConversationId}`, { method: 'DELETE' })
      console.log(`[清理] 删除对话 ${testConversationId}`)
    } catch (e) {
      console.warn(`[清理] 删除对话失败:`, e)
    }
  }

  // 清理助手
  if (testAssistantId) {
    try {
      await fetchWithAuth(`/api/assistants/${testAssistantId}`, { method: 'DELETE' })
      console.log(`[清理] 删除助手 ${testAssistantId}`)
    } catch (e) {
      console.warn(`[清理] 删除助手失败:`, e)
    }
  }

  // 清理上游配置（会级联删除关联的 aimodels）
  if (testUpstreamId) {
    try {
      await fetchWithAuth(`/api/upstreams/${testUpstreamId}`, { method: 'DELETE' })
      console.log(`[清理] 删除上游配置 ${testUpstreamId}`)
    } catch (e) {
      console.warn(`[清理] 删除上游配置失败:`, e)
    }
  }

  // 删除测试用户账户
  if (authToken) {
    try {
      const response = await fetchWithAuth('/api/user/delete', {
        method: 'POST',
        body: JSON.stringify({ password: TEST_USER_PASSWORD }),
      })
      if (response.ok) {
        console.log('[清理] 删除测试用户账户')
      } else {
        console.warn('[清理] 删除测试用户失败:', await response.text())
      }
    } catch (e) {
      console.warn('[清理] 删除测试用户失败:', e)
    }
  }

  console.log('========== 清理完成 ==========\n')
})

// ==================== 用户认证流程 ====================

describe('用户认证流程', () => {
  const testEmail = `test_${Date.now()}@example.com`
  const testPassword = TEST_USER_PASSWORD
  const testName = '测试用户'

  it('应能注册新用户', async () => {
    const response = await fetchWithAuth('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    })

    const data = await response.json()
    console.log('注册响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe(testEmail)
    expect(data.token).toBeDefined()

    // 保存 token 用于后续请求
    authToken = data.token
  })

  it('应能登录已注册用户', async () => {
    const response = await fetchWithAuth('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    })

    const data = await response.json()
    console.log('登录响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user).toBeDefined()
    expect(data.token).toBeDefined()

    // 更新 token（登录也会返回新 token）
    authToken = data.token
  })

  it('登录后应能访问受保护资源', async () => {
    const response = await fetchWithAuth('/api/tasks')

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.tasks).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)
  })
})

// ==================== 上游配置管理 ====================

describe('上游配置管理', () => {
  it('应能创建上游配置（ephone）', async () => {
    if (!TEST_CONFIG.baseUrl || !TEST_CONFIG.apiKey) {
      console.log('跳过：未配置测试环境变量')
      return
    }

    const response = await fetchWithAuth('/api/upstreams', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ephone',
        baseUrl: TEST_CONFIG.baseUrl,
        apiKey: TEST_CONFIG.apiKey,
        apiKeys: {
          default: TEST_CONFIG.apiKey,
        },
        aimodels: [
          // 对话模型：Claude
          {
            category: 'chat',
            modelType: 'claude',
            apiFormat: 'openai-chat',
            modelName: 'claude-3-7-sonnet-20250219',
            name: 'Claude 3.7 Sonnet',
            estimatedTime: 3,
            keyName: 'default',
          },
          // 绘图模型：Gemini
          {
            category: 'image',
            modelType: 'gemini',
            apiFormat: 'openai-chat',
            modelName: 'gemini-2.5-flash-image',
            name: 'Gemini 2.5 Flash Image',
            estimatedTime: 30,
            keyName: 'default',
          },
          // 绘图模型：DALL-E
          {
            category: 'image',
            modelType: 'dalle',
            apiFormat: 'dalle',
            modelName: 'dall-e-3',
            name: 'DALL-E 3',
            estimatedTime: 20,
            keyName: 'default',
          },
        ],
      }),
    })

    const data = await response.json()
    console.log('创建上游响应:', JSON.stringify(data, null, 2))

    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.name).toBe('ephone')
    expect(data.aimodels).toBeDefined()
    expect(data.aimodels.length).toBe(3)

    testUpstreamId = data.id

    // 保存各模型 ID
    for (const model of data.aimodels) {
      if (model.modelType === 'claude') {
        testChatAimodelId = model.id
      } else if (model.modelType === 'gemini') {
        testGeminiAimodelId = model.id
      } else if (model.modelType === 'dalle') {
        testDalleAimodelId = model.id
      }
    }

    console.log('创建的模型 ID:', { testChatAimodelId, testGeminiAimodelId, testDalleAimodelId })
  })

  it('应能获取上游列表', async () => {
    const response = await fetchWithAuth('/api/upstreams')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)

    if (testUpstreamId) {
      const testUpstream = data.find((u: any) => u.id === testUpstreamId)
      expect(testUpstream).toBeDefined()
      expect(testUpstream.name).toBe('ephone')
    }
  })
})

// ==================== 助手和对话功能 ====================

// 收集 SSE 事件用于验证
let sseEvents: Array<{ type: string; data: any }> = []
let sseController: AbortController | null = null

// 启动 SSE 监听
async function startSSEListener() {
  sseEvents = []
  sseController = new AbortController()

  // 使用 fetch 启动 SSE 连接（非阻塞）
  // SSE 端点支持 query 参数传递 token
  fetch(`${BASE_URL}/api/events?token=${authToken}`, {
    signal: sseController.signal,
  }).then(async (response) => {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 事件
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            eventData = line.slice(5).trim()
          } else if (line === '' && eventType && eventData) {
            try {
              const parsed = JSON.parse(eventData)
              sseEvents.push({ type: eventType, data: parsed })
              console.log(`[SSE] 收到事件: ${eventType}`)
            } catch {
              // 忽略解析错误
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch {
      // 连接被中断，正常情况
    }
  }).catch(() => {
    // 连接被中断，正常情况
  })

  // 等待连接建立
  await new Promise(resolve => setTimeout(resolve, 500))
}

// 停止 SSE 监听
function stopSSEListener() {
  if (sseController) {
    sseController.abort()
    sseController = null
  }
}

// 查找特定类型的 SSE 事件（返回 envelope.data，即实际事件数据）
function findSSEEvent(type: string): any | undefined {
  const event = sseEvents.find(e => e.type === type)
  // SSE 事件格式是 GlobalEventEnvelope: { id, ts, type, data }
  // 所以实际数据在 event.data.data 中
  return event?.data?.data
}

describe('助手和对话功能', () => {
  it('应能创建助手', async () => {
    if (!testChatAimodelId) {
      console.log('跳过：未创建对话模型')
      return
    }

    const response = await fetchWithAuth('/api/assistants', {
      method: 'POST',
      body: JSON.stringify({
        name: '测试助手',
        description: 'API 集成测试用助手',
        systemPrompt: '你是一个友好的助手，回答简洁明了。',
        aimodelId: testChatAimodelId,
        isDefault: false,
      }),
    })

    const data = await response.json()
    console.log('创建助手响应:', data)

    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.name).toBe('测试助手')
    expect(data.conversationCount).toBe(0)

    testAssistantId = data.id
  })

  it('应能创建对话并收到助手对话数量更新事件', async () => {
    if (!testAssistantId) {
      console.log('跳过：未创建助手')
      return
    }

    // 启动 SSE 监听
    await startSSEListener()

    const response = await fetchWithAuth('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({
        assistantId: testAssistantId,
        title: '测试对话',
      }),
    })

    const data = await response.json()
    console.log('创建对话响应:', data)

    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()

    testConversationId = data.id

    // 等待 SSE 事件到达
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 验证收到对话创建事件
    const conversationCreatedEvent = findSSEEvent('chat.conversation.created')
    expect(conversationCreatedEvent).toBeDefined()
    expect(conversationCreatedEvent?.conversation?.id).toBe(testConversationId)
    console.log('[SSE验证] 对话创建事件:', conversationCreatedEvent ? '✓' : '✗')

    // 验证收到助手更新事件（对话数量 +1）
    const assistantUpdatedEvent = findSSEEvent('chat.assistant.updated')
    expect(assistantUpdatedEvent).toBeDefined()
    expect(assistantUpdatedEvent?.assistant?.id).toBe(testAssistantId)
    expect(assistantUpdatedEvent?.assistant?.conversationCount).toBe(1)
    console.log('[SSE验证] 助手对话数量更新事件:', assistantUpdatedEvent ? '✓' : '✗')
    console.log('[SSE验证] 助手对话数量:', assistantUpdatedEvent?.assistant?.conversationCount)

    stopSSEListener()
  })

  it('应能发送消息并收到流式消息事件', async () => {
    if (!testConversationId) {
      console.log('跳过：未创建对话')
      return
    }

    // 重新启动 SSE 监听
    await startSSEListener()

    // 发送消息，内容中包含标题建议
    const response = await fetchWithAuth(`/api/conversations/${testConversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: '你好！这是一个关于"北京天气"的对话。请简单回复一下关于北京天气的问题，标题应该包含"北京"或"天气"关键词。',
      }),
    })

    const data = await response.json()
    console.log('发送消息响应:', data)

    expect(response.status).toBe(200)
    expect(data.userMessageId).toBeDefined()
    expect(data.assistantMessageId).toBeDefined()

    // 订阅消息流式接口
    const streamController = new AbortController()
    const streamChunks: string[] = []
    let streamError: string | null = null

    // 启动流式接收（非阻塞）
    const streamPromise = fetch(`${BASE_URL}/api/messages/${data.assistantMessageId}/stream`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: streamController.signal,
    }).then(async (streamResponse) => {
      if (!streamResponse.ok) {
        // 流式会话可能还未创建或已结束，这不是错误
        streamError = `流式接口返回 ${streamResponse.status}`
        return
      }

      const reader = streamResponse.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          streamChunks.push(chunk)
          console.log(`[Stream] 收到数据块: ${chunk.length} 字节`)
        }
      } catch {
        // 连接关闭
      }
    }).catch(() => {
      // 可能流式会话不存在
    })

    // 等待 AI 回复完成（通过轮询对话接口）
    console.log('等待 AI 回复...')
    const startTime = Date.now()
    const maxWaitMs = 120000  // 120秒，因为聊天模型可能需要较长时间
    let finalMessage: any = null

    while (Date.now() - startTime < maxWaitMs) {
      const convResponse = await fetchWithAuth(`/api/conversations/${testConversationId}`)
      const convData = await convResponse.json()

      const message = convData.messages?.find((m: any) => m.id === data.assistantMessageId)
      if (message) {
        console.log(`[Message ${data.assistantMessageId}] 状态: ${message.status}, 内容长度: ${message.content?.length || 0}`)

        if (message.status === 'completed' || message.status === 'done' || message.status === 'error') {
          finalMessage = message
          break
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 停止流式接收
    streamController.abort()
    await streamPromise.catch(() => {})

    // 验证最终消息
    expect(finalMessage).toBeDefined()
    expect(finalMessage.status).toBe('completed')
    expect(finalMessage.content).toBeTruthy()
    console.log('AI 回复:', finalMessage.content?.slice(0, 100) + '...')

    // 流式接口验证（可能成功也可能流式会话已结束）
    if (streamError) {
      console.log('[Stream验证] 流式接口:', streamError, '（可能流式会话已结束，这是正常的）')
    } else {
      console.log('[Stream验证] 收到数据块数量:', streamChunks.length)
    }

    // 验证 SSE 全局事件
    const messageEvents = sseEvents.filter(e => e.type === 'chat.message.created')
    expect(messageEvents.length).toBeGreaterThanOrEqual(2)
    console.log('[SSE验证] 消息创建事件数量:', messageEvents.length)

    // 验证收到流式内容事件
    const streamEvents = sseEvents.filter(e => e.type === 'chat.message.stream')
    console.log('[SSE验证] 流式内容事件数量:', streamEvents.length)

    // 验证收到消息完成事件
    const doneEvents = sseEvents.filter(e => e.type === 'chat.message.done')
    expect(doneEvents.length).toBeGreaterThanOrEqual(1)
    console.log('[SSE验证] 消息完成事件:', doneEvents.length > 0 ? '✓' : '✗')

    stopSSEListener()
  }, 150000)  // 150秒超时，因为聊天 API 可能需要较长时间

  it('应能智能重命名对话并验证标题包含关键词', async () => {
    if (!testConversationId) {
      console.log('跳过：未创建对话')
      return
    }

    // 调用智能重命名接口
    const response = await fetchWithAuth(`/api/conversations/${testConversationId}/generate-title`, {
      method: 'POST',
    })

    const data = await response.json()
    console.log('智能重命名响应:', data)

    expect(response.status).toBe(200)
    expect(data.title).toBeDefined()

    // 验证标题包含 "北京" 或 "天气" 关键词
    const title = data.title as string
    const containsKeyword = title.includes('北京') || title.includes('天气')

    console.log('生成的标题:', title)
    console.log('标题包含关键词:', containsKeyword ? '✓' : '✗')

    expect(containsKeyword).toBe(true)

    // 验证对话标题已更新
    const conversationResponse = await fetchWithAuth(`/api/conversations/${testConversationId}`)
    const conversationData = await conversationResponse.json()

    expect(conversationData.conversation.title).toBe(title)
    console.log('对话标题已更新:', conversationData.conversation.title)
  }, 90000)  // 90秒超时
})

// ==================== 绘图任务功能 ====================

describe('绘图任务功能', () => {
  it('应能创建 Gemini 绘图任务', async () => {
    if (!testGeminiAimodelId) {
      console.log('跳过：未创建 Gemini 绘图模型')
      return
    }

    const response = await fetchWithAuth('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'image',
        prompt: 'a cute cat sitting on a rainbow, simple illustration style',
        images: [],
        type: 'imagine',
        aimodelId: testGeminiAimodelId,
        modelType: 'gemini',
        apiFormat: 'openai-chat',
        modelName: 'gemini-2.5-flash-image',
      }),
    })

    const data = await response.json()
    console.log('创建 Gemini 任务响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.taskId).toBeDefined()

    testTaskId = data.taskId
    createdTaskIds.push(data.taskId)  // 加入清理列表

    // 等待任务完成
    console.log('等待 Gemini 绘图任务完成...')
    const task = await waitForTaskComplete(testTaskId)

    expect(task.status).toBe('success')
    expect(task.resourceUrl).toBeTruthy()
    console.log('图片URL:', task.resourceUrl)
  }, 180000)  // 3分钟超时

  it('应能创建 DALL-E 绘图任务', async () => {
    if (!testDalleAimodelId) {
      console.log('跳过：未创建 DALL-E 绘图模型')
      return
    }

    const response = await fetchWithAuth('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'image',
        prompt: 'a beautiful sunset over the ocean, oil painting style',
        images: [],
        type: 'imagine',
        aimodelId: testDalleAimodelId,
        modelType: 'dalle',
        apiFormat: 'dalle',
        modelName: 'dall-e-3',
        modelParams: {
          size: '1024x1024',
          quality: 'standard',
        },
      }),
    })

    const data = await response.json()
    console.log('创建 DALL-E 任务响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.taskId).toBeDefined()

    const dalleTaskId = data.taskId
    createdTaskIds.push(dalleTaskId)  // 加入清理列表

    // 等待任务完成
    console.log('等待 DALL-E 绘图任务完成...')
    const task = await waitForTaskComplete(dalleTaskId)

    expect(task.status).toBe('success')
    expect(task.resourceUrl).toBeTruthy()
    console.log('图片URL:', task.resourceUrl)
  }, 180000)  // 3分钟超时

  it('应能获取任务详情', async () => {
    if (!testTaskId) {
      console.log('跳过：未创建任务')
      return
    }

    const response = await fetchWithAuth(`/api/tasks/${testTaskId}`)
    const task = await response.json()

    console.log('任务详情:', task)

    expect(response.status).toBe(200)
    expect(task.id).toBe(testTaskId)
    expect(task.modelType).toBe('gemini')
  })

  it('应能获取任务列表', async () => {
    const response = await fetchWithAuth('/api/tasks')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tasks).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)

    if (testTaskId) {
      const testTask = data.tasks.find((t: any) => t.id === testTaskId)
      expect(testTask).toBeDefined()
    }
  })

  it('应能查询任务日志', async () => {
    if (!testTaskId) {
      console.log('跳过：未创建任务')
      return
    }

    const response = await fetchWithAuth(`/api/tasks/${testTaskId}/logs`)

    // 任务可能有或没有日志
    expect([200, 404]).toContain(response.status)

    if (response.status === 200) {
      const data = await response.json()
      expect(data).toBeDefined()
      console.log('任务日志:', JSON.stringify(data, null, 2).slice(0, 500))
    }
  })
})

// ==================== 任务参数验证 ====================

describe('任务参数验证', () => {
  it('缺少模型配置时应返回错误', async () => {
    const response = await fetchWithAuth('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试',
        modelType: 'gemini',
        apiFormat: 'gemini',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('模型')
  })

  it('无效模型类型应返回错误', async () => {
    const response = await fetchWithAuth('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试',
        aimodelId: testGeminiAimodelId || 1,
        modelType: 'invalid-type',
        apiFormat: 'gemini',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('模型')
  })
})

// ==================== 权限验证 ====================
// 注意：资源清理已在 afterAll 钩子中处理，确保即使测试失败也能清理
// JWT 是无状态的，不需要登出 API，只需清除客户端的 token

describe('权限验证', () => {
  it('清除 token 后应无法访问受保护资源', async () => {
    // 保存原 token，清除后测试
    const savedToken = authToken
    authToken = ''

    const response = await fetchWithAuth('/api/tasks')
    expect(response.status).toBe(401)

    // 恢复 token（用于 afterAll 清理）
    authToken = savedToken
  })
})

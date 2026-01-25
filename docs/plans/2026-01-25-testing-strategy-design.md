# MJ Studio 测试策略设计方案

> 设计日期：2026-01-25
>
> 参考项目：cherry-studio 测试架构

## 一、现状分析

### 1.1 已有测试基础

MJ Studio 已经具备以下测试基础：

**✅ 测试工具配置**
- Vitest 配置完成（`vitest.config.ts`）
- 180 秒超时配置（适合绘图任务）
- 环境变量加载（`tests/setup.ts`）

**✅ API 集成测试**（`tests/api-integration.test.ts` - 927 行）
- 用户认证流程（注册、登录、权限验证）
- 上游配置管理（创建、查询、模型导入）
- 助手和对话功能（创建、消息发送、流式输出）
- 绘图任务功能（Gemini、DALL-E、Midjourney 异步轮询）
- SSE 事件监听（异步任务状态更新）

**✅ MCP 接口测试**（`tests/mcp-integration.test.ts` - 480 行）
- MCP 认证（API Key 验证）
- 协议初始化和会话管理
- 工具列表查询
- 各种查询工具调用

### 1.2 核心痛点

根据需求调研，当前存在以下痛点：

1. **功能组合场景易出错** - 不同上游 API × MCP × 对话压缩 × 流式输出等组合使用时容易出问题
2. **依赖真实外部 API** - 测试速度慢、不稳定、无法测试边缘场景、成本高
3. **缺少单元测试** - Provider 适配逻辑、压缩边界计算等关键逻辑没有单元测试
4. **测试运行慢** - 需要启动开发服务器，违背"开发时快速验证"的目标

### 1.3 测试目标

- **防止回归** - 确保新功能不破坏现有功能
- **提高重构信心** - 重构代码时有测试保障
- **快速验证** - 开发时快速验证核心逻辑（< 10 秒）
- **生产质量保障** - 上线前确保关键路径可用

---

## 二、借鉴 cherry-studio 的测试架构

### 2.1 cherry-studio 测试架构总览

**测试项目分层**（Vitest Projects）：
```
vitest.config.ts
├── main (主进程单元测试)
│   ├── environment: node
│   ├── setupFiles: tests/main.setup.ts
│   └── include: src/main/**/__tests__/**/*.test.ts
├── renderer (渲染进程单元测试)
│   ├── environment: jsdom
│   ├── setupFiles: tests/renderer.setup.ts
│   └── include: src/renderer/**/__tests__/**/*.test.ts
├── aiCore (AI 核心包单元测试)
│   ├── environment: node
│   └── include: packages/aiCore/**/__tests__/**/*.test.ts
├── shared (共享工具包单元测试)
│   └── include: packages/shared/**/__tests__/**/*.test.ts
└── scripts (脚本单元测试)
    └── include: scripts/**/__tests__/**/*.test.ts
```

**E2E 测试**（Playwright）：
```
tests/e2e/
├── specs/
│   ├── app-launch.spec.ts
│   ├── navigation.spec.ts
│   └── conversation/basic-chat.spec.ts
├── fixtures/
│   └── electron.fixture.ts
└── utils/
    └── wait-helpers.ts
```

### 2.2 关键测试模式

#### 模式 1：全局 Mock 设置

**主进程测试设置**（`tests/main.setup.ts`）：
- Mock Electron 模块（app、ipcMain、BrowserWindow、dialog 等）
- Mock LoggerService
- Mock Winston 日志库
- Mock Node.js 核心模块（fs、path、os）

**渲染进程测试设置**（`tests/renderer.setup.ts`）：
- Mock LoggerService
- Mock uuid 生成器（确定性测试）
- Mock axios（HTTP 请求）
- Mock localStorage
- Mock electron IPC

#### 模式 2：单元测试 Mock 策略

**示例：消息转换测试**（`message-converter.test.ts`）
```typescript
// 1. 使用 vi.hoisted 提升 Mock 函数
const { convertFileBlockToFilePartMock } = vi.hoisted(() => ({
  convertFileBlockToFilePartMock: vi.fn()
}))

// 2. Mock 模块
vi.mock('../fileProcessor', () => ({
  convertFileBlockToFilePart: convertFileBlockToFilePartMock
}))

// 3. Mock 配置模块
vi.mock('@renderer/config/models', () => ({
  isVisionModel: (model: Model) => visionModelIds.has(model.id)
}))

// 4. 使用工厂函数创建测试数据
const createModel = (overrides: Partial<Model> = {}): Model => ({
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  ...overrides
})
```

**关键优势**：
- Mock 精准控制：只 Mock 必要的依赖
- 工厂函数模式：快速创建测试数据
- 可预测性：使用确定性 ID 生成器

#### 模式 3：MCP 服务测试

**示例：MCPService.test.ts**
```typescript
vi.mock('@main/apiServer/utils/mcp', () => ({
  getMCPServersFromRedux: vi.fn()
}))

it('filters disabled tools per server', async () => {
  const servers: MCPServer[] = [
    {
      id: 'alpha',
      name: 'Alpha',
      isActive: true,
      disabledTools: ['disabled_tool']
    }
  ]

  vi.mocked(getMCPServersFromRedux).mockResolvedValue(servers)

  const listToolsSpy = vi.spyOn(mcpService as any, 'listToolsImpl')
    .mockImplementation(async (server: any) => {
      if (server.id === 'alpha') {
        return [
          createTool({ name: 'enabled_tool', serverId: server.id }),
          createTool({ name: 'disabled_tool', serverId: server.id })
        ]
      }
      return [createTool({ name: 'beta_tool', serverId: server.id })]
    })

  const tools = await mcpService.listAllActiveServerTools()

  expect(tools.map(tool => tool.name)).toEqual(['enabled_tool', 'beta_tool'])
})
```

**关键优势**：
- 不依赖真实 MCP 服务器
- 可测试过滤逻辑、错误处理等边缘场景
- 快速执行（无网络请求）

### 2.3 测试命令

```json
{
  "test": "vitest run --silent",
  "test:main": "vitest run --project main",
  "test:renderer": "vitest run --project renderer",
  "test:aicore": "vitest run --project aiCore",
  "test:coverage": "vitest run --coverage --silent",
  "test:ui": "vitest --ui",
  "test:watch": "vitest",
  "test:e2e": "pnpm playwright test"
}
```

**开发工作流**：
- `pnpm test:watch` - 监听模式，快速反馈
- `pnpm test:main` - 只跑后端测试
- `pnpm test:coverage` - 生成覆盖率报告
- `pnpm test:e2e` - 跑 E2E 测试（慢，CI 使用）

---

## 三、MJ Studio 测试策略设计

### 3.1 测试金字塔（优先级排序）

基于"最小化投入"原则，我们采用**倒置金字塔**：

```
        ┌─────────────────────────────────────┐
        │  单元测试（60%精力）                 │  ← 核心：关键逻辑
        │  - Provider 适配逻辑                 │
        │  - 压缩边界计算                      │
        │  - 事件工具函数                      │
        │  - 数据转换函数                      │
        │  - MCP 工具管理                      │
        └─────────────────────────────────────┘
                       ↑
        ┌─────────────────────────────────────┐
        │  集成测试（40%精力）                 │  ← 辅助：功能组合
        │  - 对话 + 不同上游 + 流式            │
        │  - MCP 工具调用完整流程              │
        │  - 对话压缩 + 思考模式               │
        │  - 绘图任务 + 异步轮询               │
        └─────────────────────────────────────┘
                       ↑
        ┌─────────────────────────────────────┐
        │  E2E 测试（暂不实施）                │  ← 可选：UI 交互
        │  - 仅用于 CI 冒烟测试                │
        │  - 不在初期投入                      │
        └─────────────────────────────────────┘
```

**不做 E2E 的原因**：
- ❌ 太慢（启动浏览器 10-30 秒/测试）
- ❌ 不稳定（动画、异步渲染导致 flaky）
- ❌ 维护成本高（UI 改动频繁）
- ❌ 投入产出比低（不符合"最小化投入"）

### 3.2 测试项目结构

参考 cherry-studio，将测试分为两大类：

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      // 后端单元测试（server 目录）
      {
        name: 'server',
        environment: 'node',
        setupFiles: ['tests/server.setup.ts'],
        include: ['server/**/__tests__/**/*.test.ts']
      },
      // 前端单元测试（app 目录）
      {
        name: 'app',
        environment: 'jsdom',
        setupFiles: ['tests/app.setup.ts'],
        include: ['app/**/__tests__/**/*.test.ts']
      },
      // 集成测试
      {
        name: 'integration',
        environment: 'node',
        setupFiles: ['tests/integration.setup.ts'],
        include: ['tests/integration/**/*.test.ts'],
        testTimeout: 30000 // 集成测试允许更长超时
      }
    ],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/.nuxt/**',
        '**/dist/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.config.{js,ts}',
        '**/types/**'
      ]
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false // 并行运行加速
      }
    }
  }
})
```

### 3.3 目录结构

```
mj-studio/
├── server/
│   ├── services/
│   │   ├── chatProviders/
│   │   │   ├── __tests__/
│   │   │   │   ├── claude.test.ts          # Claude API 适配单元测试
│   │   │   │   ├── openai.test.ts          # OpenAI API 适配单元测试
│   │   │   │   └── gemini.test.ts          # Gemini API 适配单元测试
│   │   │   ├── claude.ts
│   │   │   ├── openai.ts
│   │   │   └── gemini.ts
│   │   ├── __tests__/
│   │   │   ├── conversation.test.ts        # 对话压缩逻辑单元测试
│   │   │   ├── streamingTask.test.ts       # 流式任务管理单元测试
│   │   │   └── toolCallState.test.ts       # 工具调用状态管理单元测试
│   │   └── ...
│   └── utils/
│       └── __tests__/
│           └── compression.test.ts         # 压缩边界计算单元测试
├── app/
│   ├── composables/
│   │   └── __tests__/
│   │       ├── useConversations.test.ts    # 前端 Composable 单元测试
│   │       └── useGlobalEvents.test.ts     # 全局事件系统单元测试
│   └── shared/
│       └── __tests__/
│           └── types.test.ts               # 类型转换工具单元测试
├── tests/
│   ├── server.setup.ts                     # 后端测试全局设置
│   ├── app.setup.ts                        # 前端测试全局设置
│   ├── integration.setup.ts                # 集成测试全局设置
│   ├── integration/                        # 集成测试
│   │   ├── chat-with-providers.test.ts     # 场景1: 对话 + 不同上游 + 流式
│   │   ├── mcp-tool-lifecycle.test.ts      # 场景2: MCP 工具调用完整流程
│   │   ├── chat-compression.test.ts        # 场景3: 对话压缩 + 思考模式
│   │   ├── task-polling.test.ts            # 场景4: 绘图任务异步轮询
│   │   └── global-events-sync.test.ts      # 场景5: 多端同步事件系统
│   ├── fixtures/                           # 测试数据和 Mock
│   │   ├── mock-responses/
│   │   │   ├── openai.json                 # OpenAI API Mock 响应
│   │   │   ├── claude.json                 # Claude API Mock 响应
│   │   │   ├── gemini.json                 # Gemini API Mock 响应
│   │   │   └── mj-proxy.json               # MJ Proxy Mock 响应
│   │   ├── test-data.ts                    # 测试数据工厂函数
│   │   └── test-db.ts                      # 测试数据库初始化
│   ├── helpers/                            # 测试辅助工具
│   │   ├── mock-apis.ts                    # Mock 外部 API（msw）
│   │   ├── mock-h3.ts                      # Mock H3 请求/响应
│   │   └── db-helpers.ts                   # 数据库测试工具
│   └── __mocks__/                          # 全局 Mock
│       ├── NuxtLogger.ts
│       └── drizzle.ts
└── vitest.config.ts
```

---

## 四、关键测试场景设计

### 4.1 单元测试场景

#### 场景 1：Provider 适配逻辑

**文件**：`server/services/chatProviders/__tests__/claude.test.ts`

**测试内容**：
```typescript
describe('Claude Provider', () => {
  describe('buildMessages', () => {
    it('正确转换消息格式（OpenAI → Claude）', () => {
      const openaiMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' }
      ]

      const claudeMessages = buildClaudeMessages(openaiMessages)

      expect(claudeMessages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] }
      ])
    })

    it('正确处理图片消息', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }
          ]
        }
      ]

      const claudeMessages = buildClaudeMessages(messages)

      expect(claudeMessages[0].content).toEqual([
        { type: 'text', text: 'Describe this' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'xxx' } }
      ])
    })

    it('正确处理 MCP 工具调用', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            { id: 't1', function: { name: 'search', arguments: '{"q":"test"}' } }
          ]
        }
      ]

      const claudeMessages = buildClaudeMessages(messages)

      expect(claudeMessages[0].content).toEqual([
        { type: 'tool_use', id: 't1', name: 'search', input: { q: 'test' } }
      ])
    })
  })

  describe('parseStreamChunk', () => {
    it('正确解析 SSE 数据块', () => {
      const chunk = 'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n'

      const result = parseClaudeStreamChunk(chunk)

      expect(result).toEqual({ type: 'text', text: 'Hello' })
    })

    it('正确处理 tool_use 数据块', () => {
      const chunk = 'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"t1","name":"search"}}\n\n'

      const result = parseClaudeStreamChunk(chunk)

      expect(result).toEqual({ type: 'tool_use', id: 't1', name: 'search' })
    })
  })
})
```

**Mock 策略**：
- 不依赖真实 Claude API
- 使用 Mock 响应数据（`tests/fixtures/mock-responses/claude.json`）

#### 场景 2：压缩边界计算

**文件**：`server/utils/__tests__/compression.test.ts`

**测试内容**：
```typescript
describe('Compression Boundary Calculation', () => {
  it('单次压缩：正确计算边界', () => {
    const messages = [
      { id: 1, role: 'user', content: 'Hello' },
      { id: 2, role: 'assistant', content: 'Hi' },
      { id: 3, role: 'user', content: 'How are you?' },
      { id: 4, role: 'assistant', content: 'Good' }
    ]

    const boundary = calculateCompressionBoundary(messages, { maxMessages: 2 })

    expect(boundary).toEqual({ start: 1, end: 2 })
  })

  it('多次压缩：摘要的摘要', () => {
    const messages = [
      { id: 1, role: 'system', content: '[Compressed 1-10]', isCompressed: true },
      { id: 11, role: 'user', content: 'Hello' },
      { id: 12, role: 'assistant', content: 'Hi' },
      // ... 更多消息
    ]

    const boundary = calculateCompressionBoundary(messages, { maxMessages: 2 })

    expect(boundary).toEqual({ start: 1, end: 12 })
  })

  it('删除压缩消息后，边界正确回退', () => {
    const messages = [
      { id: 1, role: 'system', content: '[Compressed 1-10]', isCompressed: true },
      { id: 11, role: 'user', content: 'Hello' }
    ]

    const newBoundary = recalculateBoundaryAfterDelete(messages, { deletedId: 1 })

    expect(newBoundary).toEqual({ start: 11, end: 11 })
  })
})
```

#### 场景 3：MCP 工具管理

**文件**：`server/services/__tests__/toolCallState.test.ts`

**测试内容**：
```typescript
describe('ToolCallState', () => {
  it('工具调用状态流转：pending → invoking → done', async () => {
    const toolCall = {
      id: 'tc1',
      name: 'search',
      arguments: { q: 'test' }
    }

    const state = new ToolCallState(toolCall)

    expect(state.status).toBe('pending')

    state.markInvoking()
    expect(state.status).toBe('invoking')

    await state.markDone({ result: 'found' })
    expect(state.status).toBe('done')
    expect(state.result).toEqual({ result: 'found' })
  })

  it('超时处理：30 秒后自动取消', async () => {
    vi.useFakeTimers()

    const toolCall = { id: 'tc1', name: 'slow_tool', arguments: {} }
    const state = new ToolCallState(toolCall, { timeout: 30000 })

    state.markInvoking()

    vi.advanceTimersByTime(30000)

    expect(state.status).toBe('cancelled')
    expect(state.error).toContain('timeout')

    vi.useRealTimers()
  })

  it('用户拒绝：状态变为 cancelled', () => {
    const toolCall = { id: 'tc1', name: 'delete_file', arguments: {} }
    const state = new ToolCallState(toolCall)

    state.markCancelled('user_rejected')

    expect(state.status).toBe('cancelled')
    expect(state.error).toBe('user_rejected')
  })
})
```

### 4.2 集成测试场景

#### 场景 1：对话 + 不同上游 + 流式输出

**文件**：`tests/integration/chat-with-providers.test.ts`

**测试内容**：
```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock 外部 API
const mockServer = setupServer(
  // Mock OpenAI
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return new HttpResponse(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
      {
        headers: { 'Content-Type': 'text/event-stream' }
      }
    )
  }),

  // Mock Claude
  http.post('https://api.anthropic.com/v1/messages', () => {
    return new HttpResponse(
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\ndata: {"type":"message_stop"}\n\n',
      {
        headers: { 'Content-Type': 'text/event-stream' }
      }
    )
  }),

  // Mock Gemini
  http.post(/generativelanguage\.googleapis\.com/, () => {
    return HttpResponse.json({
      candidates: [{ content: { parts: [{ text: 'Hello' }] } }]
    })
  })
)

describe('对话 + 不同上游 + 流式输出', () => {
  beforeAll(() => mockServer.listen())
  afterAll(() => mockServer.close())
  afterEach(() => mockServer.resetHandlers())

  it('OpenAI: 流式输出正确解析', async () => {
    const db = await createTestDatabase()
    const upstream = await db.insert(upstreams).values({
      name: 'Test OpenAI',
      baseUrl: 'https://api.openai.com',
      apiFormat: 'openai-chat',
      apiKey: 'test-key'
    })

    const conversation = await createConversation(db, { upstreamId: upstream.id })

    const chunks: string[] = []
    await sendMessage(conversation.id, 'Hello', {
      onChunk: (chunk) => chunks.push(chunk)
    })

    expect(chunks.join('')).toContain('Hello')
  })

  it('Claude: 流式输出正确解析', async () => {
    // 类似测试，验证 Claude 格式
  })

  it('错误处理: API 返回 500', async () => {
    mockServer.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({ error: 'Internal error' }, { status: 500 })
      })
    )

    const conversation = await createConversation(db, { upstreamId: openaiUpstream.id })

    await expect(
      sendMessage(conversation.id, 'Hello')
    ).rejects.toThrow('Internal error')
  })
})
```

**关键优势**：
- ✅ 不依赖真实 API（使用 msw Mock）
- ✅ 可测试错误场景（500、超时、格式错误）
- ✅ 快速执行（无网络请求）
- ✅ 可预测（相同输入 → 相同输出）

#### 场景 2：MCP 工具调用完整流程

**文件**：`tests/integration/mcp-tool-lifecycle.test.ts`

**测试内容**：
```typescript
describe('MCP 工具调用完整流程', () => {
  it('完整流程：AI 调用 → 用户确认 → 执行 → 返回结果 → AI 继续', async () => {
    const db = await createTestDatabase()

    // 1. 创建对话
    const conversation = await createConversation(db)

    // 2. Mock AI 响应（包含工具调用）
    mockServer.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'tc1',
                type: 'function',
                function: { name: 'search_repositories', arguments: '{"query":"nuxt mcp"}' }
              }]
            }
          }]
        })
      })
    )

    // 3. 发送消息，触发工具调用
    const response = await sendMessage(conversation.id, 'Search nuxt mcp projects')

    // 4. 验证工具调用消息已创建
    const toolMessage = await db.query.messages.findFirst({
      where: eq(messages.conversationId, conversation.id),
      orderBy: desc(messages.createdAt)
    })

    expect(toolMessage?.role).toBe('tool')
    expect(toolMessage?.toolCalls).toHaveLength(1)
    expect(toolMessage?.toolCalls[0].status).toBe('pending')

    // 5. 用户批准工具调用
    await approveToolCall(toolMessage.id, toolMessage.toolCalls[0].id)

    // 6. 验证工具调用状态变为 invoking
    const updatedToolCall = await getToolCall(toolMessage.id, toolMessage.toolCalls[0].id)
    expect(updatedToolCall.status).toBe('invoking')

    // 7. Mock MCP 工具执行结果
    mockMCPToolExecution('search_repositories', { results: ['repo1', 'repo2'] })

    // 8. 等待工具执行完成
    await waitForToolCallComplete(toolMessage.id, toolMessage.toolCalls[0].id)

    // 9. 验证工具调用状态变为 done
    const completedToolCall = await getToolCall(toolMessage.id, toolMessage.toolCalls[0].id)
    expect(completedToolCall.status).toBe('done')
    expect(completedToolCall.result).toEqual({ results: ['repo1', 'repo2'] })

    // 10. 验证 AI 继续回复
    const finalMessage = await db.query.messages.findFirst({
      where: eq(messages.conversationId, conversation.id),
      orderBy: desc(messages.createdAt)
    })

    expect(finalMessage?.role).toBe('assistant')
    expect(finalMessage?.content).toContain('repo1')
  })

  it('用户拒绝工具调用', async () => {
    // ... 创建对话和触发工具调用

    await rejectToolCall(toolMessage.id, toolMessage.toolCalls[0].id)

    const cancelledToolCall = await getToolCall(toolMessage.id, toolMessage.toolCalls[0].id)
    expect(cancelledToolCall.status).toBe('cancelled')
  })

  it('多轮工具调用：AI 调用 → 结果 → AI 再次调用', async () => {
    // 验证多轮工具调用场景
  })
})
```

#### 场景 3：对话压缩 + 思考模式

**文件**：`tests/integration/chat-compression.test.ts`

**测试内容**：
```typescript
describe('对话压缩 + 思考模式', () => {
  it('触发压缩 → 生成摘要 → 更新压缩边界', async () => {
    const db = await createTestDatabase()
    const conversation = await createConversation(db)

    // 1. 创建 20 条消息
    for (let i = 1; i <= 20; i++) {
      await addMessage(conversation.id, {
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Message ${i}`
      })
    }

    // 2. Mock 压缩 API（调用 AI 生成摘要）
    mockServer.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({
          choices: [{
            message: {
              role: 'assistant',
              content: 'Summary of messages 1-15'
            }
          }]
        })
      })
    )

    // 3. 触发压缩
    await compressConversation(conversation.id, { keepLast: 5 })

    // 4. 验证压缩消息已创建
    const compressedMessage = await db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, conversation.id),
        eq(messages.role, 'system'),
        like(messages.content, '%Summary%')
      )
    })

    expect(compressedMessage).toBeDefined()
    expect(compressedMessage?.content).toContain('Summary of messages 1-15')

    // 5. 验证压缩边界
    const conversationData = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversation.id)
    })

    expect(conversationData?.compressionBoundary).toEqual({ start: 1, end: 15 })

    // 6. 发送新消息，验证上下文裁剪
    const contextMessages = await getConversationContext(conversation.id)

    expect(contextMessages).toHaveLength(6) // 1 个压缩摘要 + 5 个保留消息
    expect(contextMessages[0].content).toContain('Summary')
  })

  it('思考模式：压缩时保留思考内容', async () => {
    const db = await createTestDatabase()
    const conversation = await createConversation(db, { thinkingEnabled: true })

    // 添加包含思考的消息
    await addMessage(conversation.id, {
      role: 'assistant',
      content: 'Final answer',
      thinking: 'Let me think... [长篇思考内容]'
    })

    // 触发压缩
    await compressConversation(conversation.id)

    // 验证思考内容被包含在摘要中
    const compressedMessage = await getCompressedMessage(conversation.id)
    expect(compressedMessage.content).toContain('思考')
  })
})
```

---

## 五、Mock 策略设计

### 5.1 全局 Mock 设置

#### 后端测试设置（`tests/server.setup.ts`）

```typescript
import { vi } from 'vitest'

// Mock Nuxt Logger
vi.mock('#imports', () => ({
  useLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

// Mock Drizzle ORM (使用内存数据库)
vi.mock('#drizzle', () => ({
  useDrizzle: vi.fn(() => createTestDatabase())
}))

// Mock Node.js 核心模块
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn()
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

// Mock 环境变量
process.env.NUXT_DATABASE_URL = ':memory:'
```

#### 前端测试设置（`tests/app.setup.ts`）

```typescript
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock Nuxt Composables
vi.mock('#app', () => ({
  useRuntimeConfig: vi.fn(() => ({
    public: {
      apiBase: 'http://localhost:3000'
    }
  })),
  useFetch: vi.fn(),
  navigateTo: vi.fn()
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
vi.stubGlobal('localStorage', localStorageMock)

// Mock EventSource（SSE）
class MockEventSource {
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
}
vi.stubGlobal('EventSource', MockEventSource)
```

### 5.2 外部 API Mock（msw）

**文件**：`tests/helpers/mock-apis.ts`

```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import openaiResponses from '../fixtures/mock-responses/openai.json'
import claudeResponses from '../fixtures/mock-responses/claude.json'
import geminiResponses from '../fixtures/mock-responses/gemini.json'

export const mockApiServer = setupServer(
  // OpenAI API
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json()

    if (body.stream) {
      return new HttpResponse(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }

    return HttpResponse.json(openaiResponses.chatCompletion)
  }),

  // Claude API
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.json()

    if (body.stream) {
      return new HttpResponse(
        'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }

    return HttpResponse.json(claudeResponses.message)
  }),

  // Gemini API
  http.post(/generativelanguage\.googleapis\.com/, async ({ request }) => {
    const body = await request.json()

    return HttpResponse.json(geminiResponses.generateContent)
  }),

  // Midjourney Proxy API
  http.post(/mj-proxy.*\/submit\/imagine/, () => {
    return HttpResponse.json({
      code: 1,
      description: 'success',
      result: 'task-id-123'
    })
  }),

  http.get(/mj-proxy.*\/task\/.*\/fetch/, () => {
    return HttpResponse.json({
      code: 1,
      description: 'success',
      status: 'SUCCESS',
      imageUrl: 'https://example.com/image.png'
    })
  })
)

// 错误场景 Mock
export const mockApiError = (provider: 'openai' | 'claude' | 'gemini', status: number, message: string) => {
  const urls = {
    openai: 'https://api.openai.com/v1/chat/completions',
    claude: 'https://api.anthropic.com/v1/messages',
    gemini: /generativelanguage\.googleapis\.com/
  }

  mockApiServer.use(
    http.post(urls[provider], () => {
      return HttpResponse.json({ error: message }, { status })
    })
  )
}
```

### 5.3 测试数据库（SQLite 内存模式）

**文件**：`tests/fixtures/test-db.ts`

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '~/server/database/schema'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

export async function createTestDatabase() {
  // 使用内存数据库（超快，测试结束自动销毁）
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

  // 运行迁移
  migrate(db, { migrationsFolder: 'server/database/migrations' })

  return db
}

// 工厂函数：快速创建测试数据
export async function createTestUser(db: any, overrides = {}) {
  const [user] = await db.insert(schema.users).values({
    username: `test-user-${Date.now()}`,
    passwordHash: 'hashed-password',
    ...overrides
  }).returning()

  return user
}

export async function createTestUpstream(db: any, overrides = {}) {
  const [upstream] = await db.insert(schema.upstreams).values({
    name: `Test Upstream ${Date.now()}`,
    baseUrl: 'https://api.openai.com',
    apiFormat: 'openai-chat',
    apiKey: 'test-key',
    ...overrides
  }).returning()

  return upstream
}

export async function createTestConversation(db: any, overrides = {}) {
  const [conversation] = await db.insert(schema.conversations).values({
    title: `Test Conversation ${Date.now()}`,
    ...overrides
  }).returning()

  return conversation
}
```

---

## 六、测试命令设计

### 6.1 package.json 脚本

```json
{
  "scripts": {
    "test": "vitest run --silent",
    "test:server": "vitest run --project server",
    "test:app": "vitest run --project app",
    "test:integration": "vitest run --project integration",
    "test:unit": "vitest run --project server --project app",
    "test:watch": "vitest",
    "test:watch:server": "vitest --project server",
    "test:watch:integration": "vitest --project integration",
    "test:coverage": "vitest run --coverage --silent",
    "test:ui": "vitest --ui",
    "test:debug": "vitest --inspect-brk --pool=threads --poolOptions.threads.singleThread=true"
  }
}
```

### 6.2 开发工作流

**日常开发**：
```bash
# 监听模式（修改代码自动重跑相关测试）
pnpm test:watch:server

# 只跑单元测试（快速验证逻辑）
pnpm test:unit

# 跑集成测试（验证功能组合）
pnpm test:integration
```

**提交前**：
```bash
# 跑全量测试
pnpm test

# 生成覆盖率报告
pnpm test:coverage
```

**调试测试**：
```bash
# 启动调试器
pnpm test:debug

# 打开 Vitest UI（可视化测试）
pnpm test:ui
```

---

## 七、实施计划

### 7.1 第一阶段：基础设施（2-3 小时）

**目标**：搭建测试基础，消除外部依赖

- [ ] 配置 Vitest Projects（server、app、integration）
- [ ] 编写全局 Mock 设置（`tests/server.setup.ts`、`tests/app.setup.ts`）
- [ ] 搭建 msw Mock 服务器（`tests/helpers/mock-apis.ts`）
- [ ] 创建测试数据库工具（`tests/fixtures/test-db.ts`）
- [ ] 编写测试数据工厂函数（`tests/fixtures/test-data.ts`）

**验收标准**：
- ✅ 运行 `pnpm test` 不依赖真实 API
- ✅ 测试速度 < 10 秒（全量）
- ✅ 可以 Mock OpenAI、Claude、Gemini 响应

### 7.2 第二阶段：核心单元测试（3-4 小时）

**目标**：覆盖最易出错的逻辑

- [ ] `server/services/chatProviders/__tests__/claude.test.ts`
- [ ] `server/services/chatProviders/__tests__/openai.test.ts`
- [ ] `server/services/chatProviders/__tests__/gemini.test.ts`
- [ ] `server/utils/__tests__/compression.test.ts`
- [ ] `server/services/__tests__/toolCallState.test.ts`

**验收标准**：
- ✅ Provider 适配逻辑覆盖率 > 80%
- ✅ 压缩边界计算覆盖所有场景
- ✅ 工具调用状态机覆盖所有状态流转

### 7.3 第三阶段：关键集成测试（4-5 小时）

**目标**：覆盖功能组合场景

- [ ] `tests/integration/chat-with-providers.test.ts`
- [ ] `tests/integration/mcp-tool-lifecycle.test.ts`
- [ ] `tests/integration/chat-compression.test.ts`
- [ ] `tests/integration/task-polling.test.ts`
- [ ] `tests/integration/global-events-sync.test.ts`

**验收标准**：
- ✅ 每个场景至少 3 个测试用例（正常、错误、边缘）
- ✅ 所有测试通过
- ✅ 测试运行速度 < 30 秒（集成测试）

### 7.4 第四阶段：持续维护（长期）

**目标**：保持测试健康

- [ ] 新功能必须附带测试
- [ ] Bug 修复必须添加回归测试
- [ ] 定期审查测试覆盖率（目标 > 70%）
- [ ] 清理 flaky 测试

---

## 八、测试规范

### 8.1 测试文件命名

- 单元测试：`__tests__/[module-name].test.ts`（与被测文件同目录）
- 集成测试：`tests/integration/[feature-name].test.ts`

### 8.2 测试用例命名

使用中文描述，清晰表达测试意图：

```typescript
describe('Claude Provider', () => {
  describe('buildMessages', () => {
    it('正确转换消息格式（OpenAI → Claude）', () => {})
    it('正确处理图片消息', () => {})
    it('正确处理 MCP 工具调用', () => {})
  })
})
```

### 8.3 测试结构（AAA 模式）

```typescript
it('压缩后发送消息时上下文正确裁剪', async () => {
  // Arrange（准备）
  const db = await createTestDatabase()
  const conversation = await createTestConversation(db)
  await addMessages(conversation.id, 20)
  await compressConversation(conversation.id, { keepLast: 5 })

  // Act（执行）
  const context = await getConversationContext(conversation.id)

  // Assert（断言）
  expect(context).toHaveLength(6) // 1 压缩摘要 + 5 保留消息
  expect(context[0].content).toContain('Summary')
})
```

### 8.4 Mock 原则

- **最小化 Mock**：只 Mock 必要的依赖（外部 API、文件系统）
- **精准 Mock**：Mock 函数返回值应与真实场景一致
- **可预测性**：使用确定性数据（固定 ID、时间戳）

### 8.5 测试覆盖率目标

- 核心逻辑（Provider 适配、压缩计算）：> 90%
- 服务层（Conversation、StreamingTask）：> 80%
- API 路由：> 70%
- 工具函数：> 80%

---

## 九、总结

### 9.1 测试策略核心原则

1. **单元测试优先**：60% 精力投入单元测试，覆盖关键逻辑
2. **集成测试补充**：40% 精力投入集成测试，覆盖功能组合
3. **消除外部依赖**：全部 Mock 外部 API，使用内存数据库
4. **快速反馈**：单元测试 < 1 秒，集成测试 < 30 秒
5. **最小化投入**：不做 E2E，聚焦核心场景

### 9.2 预期收益

- ✅ **防止回归**：修改代码后立即发现问题
- ✅ **提高重构信心**：敢于重构关键逻辑
- ✅ **快速验证**：开发时几秒内得到反馈
- ✅ **生产质量保障**：关键路径有测试覆盖

### 9.3 投入时间估算

| 阶段 | 工作量 | 预计时间 |
|------|--------|----------|
| 第一阶段：基础设施 | 搭建 Mock、测试数据库 | 2-3 小时 |
| 第二阶段：核心单元测试 | 5 个关键模块 | 3-4 小时 |
| 第三阶段：关键集成测试 | 5 个场景 | 4-5 小时 |
| **总计** | - | **9-12 小时** |

### 9.4 下一步行动

根据优先级选择：

**选项 A**：最快见效（推荐）
1. 搭建基础设施（Mock API + 测试数据库）
2. 写 1-2 个 Provider 单元测试作为示例
3. 体验"秒级反馈"

**选项 B**：直接解决痛点
1. 写一个完整的功能组合场景测试
2. 验证是否覆盖核心担忧

**选项 C**：按计划逐步实施
1. 按第一阶段 → 第二阶段 → 第三阶段顺序推进
2. 每个阶段验收后再进入下一阶段

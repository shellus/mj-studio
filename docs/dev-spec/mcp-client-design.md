# MCP 客户端系统设计

## 概述

MCP 客户端功能让 AI 助手能够调用外部 MCP 服务提供的工具，扩展 AI 的能力边界。

**与 MCP 服务端的区别**：
- **MCP 服务端**：向外提供服务（让 Claude Desktop、Cursor 调用本系统）
- **MCP 客户端**：向内扩展能力（让本系统的 AI 助手调用外部 MCP 服务）

**核心特性**：
- 用户级别定义 MCP 服务，助手级别选择启用
- 支持 SSE 和 StreamableHTTP 传输
- 可配置的工具自动批准机制
- 多步工具调用（Agent Loop）
- 工具调用内联展示

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户配置层                               │
├─────────────────────────────────────────────────────────────────┤
│  设置页面 (/settings/mcp)                                        │
│  └── MCP 服务管理（用户级）                                       │
│       ├── 服务列表（名称、类型、URL、状态）                        │
│       └── 工具管理（启用/禁用、自动批准）                          │
│                                                                  │
│  助手设置                                                        │
│  └── MCP 服务选择（助手级）                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         服务连接层                               │
├─────────────────────────────────────────────────────────────────┤
│  MCPClientManager（服务端单例）                                   │
│  ├── 连接池管理（Map<userId_serverId, McpClientInstance>）       │
│  ├── 传输适配（SSE / StreamableHTTP）                            │
│  ├── 工具发现与缓存                                              │
│  └── 空闲连接自动清理                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         对话集成层                               │
├─────────────────────────────────────────────────────────────────┤
│  ChatProvider 扩展                                               │
│  ├── MCP 工具转换为各模型 API 格式                                │
│  ├── 工具调用响应处理                                            │
│  └── Agent Loop（多步工具调用）                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 传输类型

| 类型 | 配置方式 | 说明 |
|-----|---------|------|
| `streamableHttp` | URL 以 `/mcp` 结尾 | MCP 官方推荐的 HTTP 传输 |
| `sse` | 其他 HTTP URL | 传统 SSE 传输 |
| `stdio` | 配置 `command` | 本地进程传输，通过 stdin/stdout 通信 |

**stdio 传输配置**：
- `command`: 可执行命令（如 `npx`、`node`、`python`）
- `args`: 命令行参数数组
- `env`: 环境变量（会与 `process.env` 合并，自定义变量优先）

---

## 数据模型

### 数据库表

**`mcp_servers`** - 用户级 MCP 服务配置

| 字段 | 类型 | 说明 |
|-----|------|------|
| `id` | INTEGER | 主键 |
| `user_id` | INTEGER | 所属用户 |
| `name` | TEXT | 服务名称 |
| `type` | TEXT | 传输类型：`sse` / `streamableHttp` / `stdio` |
| `is_active` | INTEGER | 是否启用 |
| `base_url` | TEXT | 服务地址 |
| `headers` | TEXT (JSON) | 自定义请求头 |
| `timeout` | INTEGER | 工具调用超时（秒） |
| `command` | TEXT | stdio 命令（stdio 类型必填） |
| `args` | TEXT (JSON) | 命令行参数数组 |
| `env` | TEXT (JSON) | 环境变量 |
| `disabled_tools` | TEXT (JSON) | 禁用的工具列表 |
| `auto_approve_tools` | TEXT (JSON) | 自动批准的工具列表 |

**`assistant_mcp_servers`** - 助手与 MCP 服务的关联

| 字段 | 类型 | 说明 |
|-----|------|------|
| `assistant_id` | INTEGER | 助手 ID |
| `mcp_server_id` | INTEGER | MCP 服务 ID |

### 核心类型

**`McpToolWithServer`** - 带服务信息的工具定义

```typescript
interface McpToolWithServer {
  serverId: number
  serverName: string
  name: string           // 原始工具名
  displayName: string    // mcp__{server}__{tool} 格式
  description: string
  inputSchema: Record<string, unknown>
  isEnabled: boolean
  isAutoApprove: boolean
}
```

**`ToolCallResult`** - 工具调用结果

```typescript
interface ToolCallResult {
  success: boolean
  content?: unknown
  error?: string
}
```

**`ToolCallRecord`** - 工具调用记录（存储在 tool 消息的 content 中）

```typescript
interface ToolCallRecord {
  id: string                    // tool_use_id
  serverId: number
  serverName: string
  toolName: string              // 原始工具名
  displayName: string           // mcp__{server}__{tool} 格式，用于 AI 模型识别
  arguments: Record<string, unknown>
  status: 'pending' | 'invoking' | 'done' | 'error' | 'cancelled'
  response?: unknown
  isError?: boolean
}
```

---

## 消息存储结构

工具调用采用"assistant 消息内嵌 toolCalls 数组"模式存储，避免连续工具调用产生大量消息气泡。

### 消息类型

| 角色 | 字段 | 说明 |
|-----|------|------|
| `assistant` | `content` | AI 回复文本 |
| `assistant` | `toolCalls` | 工具调用记录数组 (`ToolCallRecord[]`) |

### 工具调用流程中的消息更新

```
1. AI 返回 tool_use
   └── 保存/更新 assistant 消息
       ├── content: 当前文本内容
       └── toolCalls: [{status: 'pending', ...}]

2. 用户确认/拒绝
   └── 更新 assistant 消息的 toolCalls 中对应记录的 status

3. 工具执行完成
   └── 更新 assistant 消息的 toolCalls 中对应记录的 status、response、isError

4. 连续多个工具调用
   └── 所有调用追加到同一个 assistant 消息的 toolCalls 数组中

5. AI 继续回复
   └── 更新同一个 assistant 消息的 content
```

### SSE 事件

| 事件 | 说明 |
|-----|------|
| `assistant.toolCall.updated` | assistant 消息的单个工具调用状态更新 |

---

### MCPClientManager

服务端单例，管理所有用户的 MCP 连接池。位于 `server/services/mcpClient/index.ts`。

**连接池配置** (`MCP_CLIENT_CONFIG`)：
- 连接超时：30 秒
- 工具缓存：5 分钟
- 空闲清理：30 分钟无活动断开
- 最大工具调用轮次：20

**主要方法**：
- `getClient(userId, server)` - 获取或创建客户端实例
- `getToolsForServers(userId, servers)` - 批量获取多个服务的工具
- `callTool(userId, server, toolName, args)` - 调用工具
- `testConnection(userId, server)` - 测试服务连接

### McpClientInstance

单个 MCP 服务的连接实例。位于 `server/services/mcpClient/instance.ts`。

**状态管理**：
- `status`: `disconnected` | `connecting` | `connected` | `error`
- `toolsCache`: 工具列表缓存
- `lastActiveAt`: 最后活动时间（用于空闲清理）

**主要方法**：
- `connect()` - 建立连接
- `listTools()` - 获取工具列表（带缓存）
- `callTool(name, args)` - 执行工具调用

### toolCallState

工具调用确认状态管理。位于 `server/services/toolCallState.ts`。

管理等待用户确认的工具调用，存储 Promise resolve/reject 回调，同时维护工具调用的完整状态信息用于前端查询和 SSE 广播。

**工具调用状态** (`ToolCallEventStatus`)：
- `pending` - 等待用户确认
- `invoking` - 正在执行
- `done` - 执行完成
- `error` - 执行出错
- `cancelled` - 已取消

**主要函数**：
- `waitForToolConfirmation(messageId, toolCallId)` - 等待用户确认，返回 Promise
- `confirmToolCall(messageId, toolCallId, approved)` - 确认或拒绝
- `updateToolCallStatus(...)` - 更新内存状态并广播旧版 SSE 事件
- `broadcastToolMessageUpdate(...)` - 广播 `tool.message.updated` 事件（新版）

### 工具名称转换

MCP 工具在传递给 AI 模型时使用统一的命名格式：

```
mcp__{serverName}__{toolName}
```

- 服务名和工具名中的非字母数字字符替换为下划线
- 最大长度 63 字符
- 相关函数：`buildToolDisplayName()`, `parseToolDisplayName()`

---

## Agent Loop 流程

对话中的工具调用采用循环模式，直到 AI 返回纯文本响应或达到最大轮次。

```
开始对话请求
    │
    ▼
获取助手关联的 MCP 服务 → 获取启用的工具列表 → 转换为模型工具格式
    │
    ▼
┌─────────────────────────────────────┐
│ 发起 AI 请求（带 tools 参数）        │◄──────────────┐
└─────────────────────────────────────┘               │
    │                                                 │
    ▼                                                 │
流式接收 AI 响应                                       │
    │                                                 │
    ├─ 文本响应 → 完成                                 │
    │                                                 │
    └─ 工具调用 → 检查自动批准                          │
                    │                                 │
                    ├─ 自动批准 → 执行工具 ─────────────┤
                    │                                 │
                    └─ 需确认 → 等待用户响应            │
                                │                     │
                                ├─ 批准 → 执行工具 ────┤
                                │                     │
                                └─ 拒绝 → 返回拒绝消息 ─┘
```

---

## API 接口

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/mcp-servers` | 获取用户的服务列表 |
| POST | `/api/mcp-servers` | 创建服务 |
| PUT | `/api/mcp-servers/[id]` | 更新服务 |
| DELETE | `/api/mcp-servers/[id]` | 删除服务 |
| POST | `/api/mcp-servers/[id]/connect` | 测试连接 |
| GET | `/api/mcp-servers/[id]/tools` | 获取工具列表 |
| GET | `/api/assistants/[id]/mcp-servers` | 获取助手关联的服务 ID |
| POST | `/api/messages/[id]/tool-confirm` | 确认或拒绝工具调用 |

---

## 文件结构

```
server/
├── services/
│   ├── mcpClient/
│   │   ├── index.ts        # MCPClientManager 单例
│   │   ├── instance.ts     # McpClientInstance 类
│   │   ├── transports.ts   # 传输层适配
│   │   ├── config.ts       # 配置常量
│   │   └── types.ts        # 类型定义
│   ├── mcpServer.ts        # MCP 服务 CRUD Service
│   └── toolCallState.ts    # 工具调用状态管理
│
├── api/mcp-servers/
│   ├── index.get.ts
│   ├── index.post.ts
│   ├── [id].put.ts
│   ├── [id].delete.ts
│   └── [id]/
│       ├── connect.post.ts
│       └── tools.get.ts
│
├── api/assistants/[id]/
│   └── mcp-servers.get.ts
│
└── api/messages/[id]/
    └── tool-confirm.post.ts

app/
├── components/
│   ├── mcp/
│   │   ├── ServerCard.vue
│   │   └── ServerEditModal.vue
│   └── chat/
│       └── ToolCallBlock.vue      # 工具调用内联块（含状态、参数、结果展示）
│
├── composables/
│   └── useMcpServers.ts
│
└── pages/settings/
    └── mcp.vue
```

---

## 参考

- [MCP 官方 SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [现有 MCP 服务端实现](../features/MCP接口功能介绍.md)

# 工具调用合并到助手消息 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 将工具调用从独立的 `tool` 消息合并到 `assistant` 消息中，解决空气泡和消息过多的问题。

**架构变更:**
- 移除 `role: 'tool'` 消息类型
- `assistant` 消息新增 `toolCalls` 字段存储工具调用记录
- 消息状态在工具执行期间保持 `streaming`，直到 AI 最终回复完成

---

## 数据结构

### Message 表结构

```typescript
interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'  // 移除 'tool'
  content: string
  files?: MessageFile[]
  toolCalls?: ToolCallRecord[]  // 新增：工具调用记录
  modelDisplayName?: string
  mark?: MessageMark
  status?: MessageStatus
  sortId?: number
  createdAt: Date
}
```

### ToolCallRecord 结构（不变）

```typescript
interface ToolCallRecord {
  id: string
  serverId: number
  serverName: string
  toolName: string
  displayName: string
  arguments: Record<string, unknown>
  status: 'pending' | 'invoking' | 'done' | 'error' | 'cancelled'
  response?: unknown
  isError?: boolean
}
```

---

## 状态流转

### 助手消息状态

```
created → pending → streaming → completed/stopped/failed
                        │
                        │ (AI 返回 tool_use)
                        ▼
                   更新 toolCalls 字段
                   状态保持 streaming
                        │
                        │ (工具执行完成，继续调用 AI)
                        ▼
                   AI 继续回复，追加 content
                        │
                        ▼
                   completed (AI 回复完成)
```

### 关键点

1. **有工具调用时，消息状态保持 `streaming`**，不会变成 `completed`
2. **工具执行期间**，只更新 `toolCalls` 字段，不改变消息状态
3. **AI 最终回复完成后**，状态才变为 `completed`

---

## SSE 事件

### 新事件：assistant.toolCall.updated

单个工具调用状态变化时广播（精细粒度）。

```typescript
interface AssistantToolCallUpdated {
  conversationId: number
  messageId: number
  toolCallId: string
  toolCall: ToolCallRecord
}
```

### 移除的事件

- `tool.message.updated`
- `tool.call.status.updated`

---

## 前端渲染

### 助手消息结构

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 助手消息                                                  │
├─────────────────────────────────────────────────────────────┤
│ [文本内容 - StreamMarkdown]                                  │
│                                                              │
│ [工具调用区域 - 紧凑排列，无间隔]                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔧 search @serper                          ✓ 已完成     │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 🔧 fetch @fetch                            ⏳ 执行中    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 渲染逻辑

1. 如果 `message.content` 有内容，渲染 StreamMarkdown
2. 如果 `message.toolCalls` 有内容，渲染工具调用块（紧凑排列）
3. 如果两者都为空且状态为 streaming，显示加载动画

---

## 历史消息构建（ChatProvider）

### 场景：工具执行后继续调用 AI

传递给 AI 的消息序列：

```
1. [历史消息...]
2. user: "搜索一下开源对话软件"
3. assistant:
   - content: "让我帮你搜索一下。"
   - toolCalls: [{ displayName: "mcp__serper__google_search", response: {...} }]
4. (继续调用 AI，不传 userMessage)
```

### 各 API 格式转换

**OpenAI**：assistant 消息带 `tool_calls`，然后 `role: tool` 消息带结果

**Claude**：assistant 消息带 `tool_use` 块，然后 user 消息带 `tool_result` 块

**Gemini**：model 消息带 `functionCall`，然后 user 消息带 `functionResponse`

---

## 实现任务

### Task 1: 类型定义更新

**文件:**
- `app/shared/types.ts`
- `app/shared/events.ts`

**步骤:**
1. `MessageRole` 移除 `'tool'`
2. `ToolCallRecord` 注释更新
3. 移除 `ToolMessageUpdated`、`ToolCallStatusUpdated`
4. 新增 `AssistantToolCallUpdated`

**验证:** `npx vue-tsc --noEmit`

---

### Task 2: 数据库 Schema 更新

**文件:**
- `server/database/schema.ts`
- `server/database/migrations/0022_add-tool-calls-to-message.sql`

**步骤:**
1. `messages` 表添加 `toolCalls` 字段
2. 导入 `ToolCallRecord` 类型
3. 迁移脚本：添加字段 + 删除 `role='tool'` 的消息

**验证:** 重启开发服务器，检查迁移执行

---

### Task 3: Conversation Service 更新

**文件:**
- `server/services/conversation.ts`

**步骤:**
1. `updateToolMessage` 改为 `updateMessageToolCalls(messageId, toolCalls)`
2. 导入 `ToolCallRecord` 类型
3. 更新导出列表

**验证:** `npx vue-tsc --noEmit`

---

### Task 4: toolCallState 重构

**文件:**
- `server/services/toolCallState.ts`

**步骤:**
1. 移除 `broadcastToolMessageUpdate`
2. 新增 `broadcastToolCallUpdated(userId, conversationId, messageId, toolCallId, toolCall)`
3. 广播事件改为 `assistant.toolCall.updated`

**验证:** `npx vue-tsc --noEmit`

---

### Task 5: streamingTask 核心重构

**文件:**
- `server/services/streamingTask.ts`

**变更点:**

1. **移除创建 tool 消息的逻辑**
2. **工具调用时更新当前 assistant 消息的 toolCalls 字段**
3. **消息状态保持 streaming 直到 AI 最终回复完成**
4. **工具执行完成后，继续调用 AI 时不传 userMessage**

**详细步骤:**

```
原流程:
1. 创建 assistant 消息
2. AI 返回 tool_use → 保存 assistant 消息 → 创建 tool 消息
3. 执行工具 → 更新 tool 消息
4. 创建新 assistant 消息 → 继续调用 AI

新流程:
1. 创建 assistant 消息 (status: created)
2. AI 返回 tool_use → 更新 assistant.toolCalls (status 保持 streaming)
3. 执行工具 → 更新 assistant.toolCalls 中对应记录的状态
4. 继续调用 AI → 追加到 assistant.content
5. AI 回复完成 → status: completed
```

**验证:** 手动测试工具调用流程

---

### Task 6: ChatProvider 历史消息构建

**文件:**
- `server/services/chatProviders/gemini.ts`
- `server/services/chatProviders/claude.ts`
- `server/services/chatProviders/openaiChat.ts`
- `server/services/chatProviders/openaiResponse.ts`

**步骤:**

1. 修改 `buildMessages`/`buildContents` 函数
2. 遍历消息时，检查 `msg.toolCalls` 而不是下一条 `tool` 消息
3. 如果有 `toolCalls`，构建工具调用请求 + 工具结果

**伪代码:**
```typescript
for (const msg of historyMessages) {
  if (msg.role === 'assistant') {
    if (msg.toolCalls?.length) {
      // 1. 添加 assistant 消息（content + tool_calls）
      // 2. 添加工具结果消息
    } else {
      // 普通 assistant 消息
    }
  } else if (msg.role === 'user') {
    // 用户消息
  }
}
```

**验证:** 手动测试多轮工具调用

---

### Task 7: 前端组件更新

**文件:**
- `app/components/chat/MessageList.vue`
- `app/components/chat/ToolCallBlock.vue`
- `app/composables/useConversations.ts`
- `app/composables/useGlobalEvents.ts`

**步骤:**

1. **MessageList.vue:**
   - 移除 `role === 'tool'` 的渲染分支
   - assistant 消息渲染时，检查 `toolCalls` 字段
   - 如果有 `toolCalls`，在文本内容下方渲染工具调用块

2. **ToolCallBlock.vue:**
   - 移除 `space-y-3` 间隔，改为紧凑排列
   - 订阅 `assistant.toolCall.updated` 事件
   - 只更新匹配 `toolCallId` 的记录

3. **useConversations.ts:**
   - `Message` 类型添加 `toolCalls` 字段

4. **useGlobalEvents.ts:**
   - 移除 `ToolMessageUpdated` 类型
   - 新增 `AssistantToolCallUpdated` 类型

**验证:** 手动测试 UI 渲染

---

### Task 8: 删除废弃文件和代码

**文件:**
- 删除 `app/components/chat/ToolResultMessage.vue`
- 删除 `server/api/messages/[id]/tool-calls/` 目录（如果存在）

**步骤:**
1. 删除不再需要的组件
2. 清理相关导入

**验证:** `npx vue-tsc --noEmit`

---

### Task 9: 前端事件处理更新

**文件:**
- `app/plugins/global-events.client.ts`

**步骤:**
1. 移除 `tool.message.updated` 事件处理
2. 新增 `assistant.toolCall.updated` 事件处理
3. 更新对应消息的 `toolCalls` 数组中的特定记录

**验证:** 手动测试实时更新

---

### Task 10: 文档更新

**文件:**
- `docs/dev-spec/mcp-client-design.md`
- `docs/features/MCP客户端功能介绍.md`

**步骤:**
1. 更新数据结构说明
2. 更新消息流程图
3. 更新 SSE 事件说明

---

## 验证方案

1. **单工具调用:** 状态流转 pending → invoking → done
2. **连续工具调用:** 多个工具在同一 assistant 消息的 toolCalls 中
3. **工具拒绝/失败:** 状态正确更新为 cancelled/error
4. **多端同步:** SSE 事件正确广播，其他端实时更新
5. **历史消息:** 刷新后正确加载，AI 能理解历史工具调用
6. **类型检查:** `npx vue-tsc --noEmit` 通过

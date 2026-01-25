# Tool Calls 重构问题修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 tool calls 重构过程中发现的所有设计文档漏洞和实现隐患

**Architecture:** 修改涉及事件类型定义、前端事件处理、后端服务逻辑、文档同步更新

**Tech Stack:** TypeScript, Vue 3, Nuxt 4, SSE Events

---

## 问题清单

| # | 类型 | 描述 |
|---|------|------|
| 1 | 事件类型 | `ChatMessageCreated` 事件缺少 `toolCalls` 字段 |
| 2 | 前端处理 | `global-events.client.ts` 中创建消息时未处理 `toolCalls` |
| 3 | 后端逻辑 | `fork` 函数未复制 `toolCalls` |
| 4 | 后端逻辑 | 中止时工具调用状态可能不一致 |
| 5 | 类型定义 | 存在重复的 `ToolCall` 和 `ToolCallRecord` 类型 |
| 6 | 文档更新 | `mcp-client-design.md` SSE 事件描述过时 |
| 7 | 文档更新 | `mcp-client-design.md` 文件结构描述过时 |
| 8 | 文档更新 | `mcp-client-design.md` 消息存储描述与新设计矛盾 |

---

### Task 1: 为 `ChatMessageCreated` 事件添加 `toolCalls` 字段

**Files:**
- Modify: `app/shared/events.ts:28-44`

**Step 1: 修改事件类型定义**

在 `ChatMessageCreated` 的 `message` 对象中添加 `toolCalls` 字段：

```typescript
// app/shared/events.ts - ChatMessageCreated 接口
export interface ChatMessageCreated {
  conversationId: number
  assistantId?: number
  lastActiveAt?: string
  message: {
    id: number
    conversationId: number
    role: MessageRole
    content: string
    files: MessageFile[] | null
    modelDisplayName?: string | null
    status: MessageStatus | null
    mark: MessageMark | null
    sortId: number | null
    createdAt?: string
    toolCalls?: ToolCallRecord[]  // 新增
  }
}
```

**Step 2: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS（新增可选字段不会破坏现有代码）

**Step 3: 提交**

```bash
git add app/shared/events.ts
git commit -m "feat: 为 ChatMessageCreated 事件添加 toolCalls 字段"
```

---

### Task 2: 前端事件处理器支持 `toolCalls`

**Files:**
- Modify: `app/plugins/global-events.client.ts:86-118`

**Step 1: 修改 `chat.message.created` 事件处理器**

在创建新消息时包含 `toolCalls`：

```typescript
// app/plugins/global-events.client.ts - chat.message.created 处理器
on<ChatMessageCreated>('chat.message.created', (data) => {
  const { conversationId, assistantId, lastActiveAt, message } = data

  // 更新助手的 lastActiveAt（用于排序）
  if (assistantId && lastActiveAt) {
    const assistant = assistants.value.find(a => a.id === assistantId)
    if (assistant) {
      assistant.lastActiveAt = lastActiveAt
    }
  }

  if (currentConversationId.value !== conversationId) return

  const existingIndex = messages.value.findIndex(m => m.id === message.id)
  const existing = messages.value[existingIndex]

  if (existingIndex >= 0 && existing) {
    existing.conversationId = message.conversationId
    existing.role = message.role
    if (existing.status !== 'streaming') {
      existing.content = message.content
    }
    existing.files = message.files
    existing.modelDisplayName = message.modelDisplayName ?? null
    existing.createdAt = message.createdAt || existing.createdAt
    existing.mark = message.mark as any
    existing.status = message.status as any
    // 新增：更新 toolCalls（仅当非流式状态时）
    if (existing.status !== 'streaming' && message.toolCalls) {
      existing.toolCalls = message.toolCalls
    }
  } else {
    messages.value.push({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      files: message.files,
      modelDisplayName: message.modelDisplayName ?? null,
      createdAt: message.createdAt || new Date().toISOString(),
      mark: message.mark as any,
      status: message.status as any,
      toolCalls: message.toolCalls,  // 新增
    })
  }

  if (message.role === 'assistant' &&
      (message.status === 'created' || message.status === 'pending' || message.status === 'streaming') &&
      currentConversationId.value === conversationId) {
    subscribeToMessageStream(message.id, conversationId, message.content || '')
  }
})
```

**Step 2: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS

**Step 3: 提交**

```bash
git add app/plugins/global-events.client.ts
git commit -m "feat: 前端事件处理器支持 toolCalls 字段"
```

---

### Task 3: 修复 `fork` 函数复制 `toolCalls`

**Files:**
- Modify: `server/services/conversation.ts:386-397`

**Step 1: 在 `fork` 函数中复制 `toolCalls`**

找到 `fork` 函数中调用 `addMessage` 的位置，添加 `toolCalls` 参数：

```typescript
// server/services/conversation.ts - fork 函数中的消息复制
const newMsg = await addMessage(userId, {
  conversationId: newConversation.id,
  role: msg.role,
  content: msg.content,
  files: msg.files ?? undefined,
  modelDisplayName: msg.modelDisplayName ?? undefined,
  mark: msg.mark ?? undefined,
  status: msg.status ?? undefined,
  toolCalls: msg.toolCalls ?? undefined,  // 新增
})
```

**Step 2: 确认 `addMessage` 函数签名支持 `toolCalls`**

检查 `addMessage` 函数是否已支持 `toolCalls` 参数。如果不支持，需要先修改函数签名。

**Step 3: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS

**Step 4: 提交**

```bash
git add server/services/conversation.ts
git commit -m "fix: fork 函数复制 toolCalls 到新对话"
```

---

### Task 4: 中止时清理未完成的工具调用状态

**Files:**
- Modify: `server/services/streamingTask.ts:382-440`

**Step 1: 在 abort 检测后更新未完成工具调用状态**

在 `Promise.all` 处理工具调用的循环中，当检测到 abort 时，将未完成的工具调用标记为 `cancelled`：

```typescript
// server/services/streamingTask.ts - 工具调用循环中的 abort 处理
await Promise.all(pendingToolCalls.map(async (call, i) => {
  // ... 现有代码 ...

  if (abortController.signal.aborted) {
    // 将未完成的工具调用标记为 cancelled
    const record = currentToolCallRecords[i]
    if (record && record.status === 'invoking') {
      record.status = 'cancelled'
      // 更新数据库
      await updateMessageToolCalls(assistantMessage.id, currentToolCallRecords)
      // 广播状态变更
      broadcastToolCallUpdate(
        conversationId,
        assistantMessage.id,
        record.id,
        record
      )
    }
    return
  }

  // ... 后续代码 ...
}))
```

**Step 2: 在循环结束后统一处理中止状态**

更好的方式是在 `Promise.all` 之后统一检查并更新：

```typescript
// 在 Promise.all 之后添加
if (abortController.signal.aborted) {
  // 将所有 invoking 状态的工具调用标记为 cancelled
  let hasChanges = false
  for (const record of currentToolCallRecords) {
    if (record.status === 'invoking') {
      record.status = 'cancelled'
      hasChanges = true
      broadcastToolCallUpdate(
        conversationId,
        assistantMessage.id,
        record.id,
        record
      )
    }
  }
  if (hasChanges) {
    await updateMessageToolCalls(assistantMessage.id, currentToolCallRecords)
  }
}
```

**Step 3: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS

**Step 4: 提交**

```bash
git add server/services/streamingTask.ts
git commit -m "fix: 中止时将未完成的工具调用标记为 cancelled"
```

---

### Task 5: 统一 `ToolCall` 和 `ToolCallRecord` 类型

**Files:**
- Modify: `app/shared/types.ts:146-165, 524-536`

**Step 1: 分析两个类型的用途**

- `ToolCallRecord`: 用于 assistant 消息存储和前端展示
- `ToolCall`: MCP 客户端内部使用（旧版）

**Step 2: 移除或合并重复类型**

如果 `ToolCall` 仅在少数地方使用，考虑直接使用 `ToolCallRecord`。否则添加明确的文档注释区分用途：

```typescript
// app/shared/types.ts

/**
 * 工具调用记录 - 存储在 assistant 消息的 toolCalls 字段
 * 用于：数据库存储、前端展示、SSE 事件传输
 */
export interface ToolCallRecord {
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

// 如果 ToolCall 类型不再需要，删除它
// 如果仍需要，添加注释说明其用途，并考虑重命名以区分
```

**Step 3: 搜索 `ToolCall` 类型的使用位置**

运行: `grep -rn "ToolCall" --include="*.ts" --include="*.vue" app/ server/ | grep -v ToolCallRecord`

**Step 4: 根据使用情况决定保留或删除**

**Step 5: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS

**Step 6: 提交**

```bash
git add app/shared/types.ts
git commit -m "refactor: 统一 ToolCall 相关类型定义"
```

---

### Task 6: 更新 `mcp-client-design.md` SSE 事件描述

**Files:**
- Modify: `docs/dev-spec/mcp-client-design.md:174-180`

**Step 1: 更新 SSE 事件表格**

将旧的事件描述替换为新的：

```markdown
### SSE 事件

| 事件 | 说明 |
|-----|------|
| `assistant.toolCall.updated` | assistant 消息的单个工具调用状态更新 |
```

**Step 2: 提交**

```bash
git add docs/dev-spec/mcp-client-design.md
git commit -m "docs: 更新 mcp-client-design.md 的 SSE 事件描述"
```

---

### Task 7: 更新 `mcp-client-design.md` 文件结构描述

**Files:**
- Modify: `docs/dev-spec/mcp-client-design.md:326-337`

**Step 1: 移除已删除的文件引用**

删除 `ToolResultMessage.vue` 的引用，并更新 `ToolCallBlock.vue` 的描述：

```markdown
app/
├── components/
│   ├── mcp/
│   │   ├── ServerCard.vue
│   │   └── ServerEditModal.vue
│   └── chat/
│       └── ToolCallBlock.vue      # 工具调用内联块（含状态、参数、结果展示）
```

**Step 2: 提交**

```bash
git add docs/dev-spec/mcp-client-design.md
git commit -m "docs: 更新 mcp-client-design.md 的文件结构描述"
```

---

### Task 8: 更新 `mcp-client-design.md` 消息存储描述

**Files:**
- Modify: `docs/dev-spec/mcp-client-design.md:146-172`

**Step 1: 更新消息存储结构说明**

将旧的 `role: 'tool'` 描述替换为新的内嵌结构：

```markdown
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
```

**Step 2: 提交**

```bash
git add docs/dev-spec/mcp-client-design.md
git commit -m "docs: 更新 mcp-client-design.md 的消息存储描述"
```

---

### Task 9: 运行完整类型检查并验证

**Step 1: 运行类型检查**

运行: `npx vue-tsc --noEmit`
预期: PASS

**Step 2: 检查所有修改**

运行: `git diff --stat HEAD`

**Step 3: 最终提交（如有遗漏）**

如果有遗漏的修改，补充提交。

---

## 执行顺序

1. Task 1 → Task 2（事件类型和前端处理有依赖）
2. Task 3（独立）
3. Task 4（独立）
4. Task 5（独立，但可能影响其他任务）
5. Task 6 → Task 7 → Task 8（文档更新可合并为一次提交）
6. Task 9（最终验证）

建议将 Task 6-8 的文档更新合并为一次提交。

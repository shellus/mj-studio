# 缓存友好的对话压缩实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## 背景

### Anthropic 缓存计费机制

Anthropic API 支持 Prompt Caching，当请求的消息数组前缀与之前的请求一致时，会命中缓存：

- **缓存写入（Cache Write）**：首次发送时按写入价格计费（略高于普通输入）
- **缓存读取（Cache Read）**：后续请求命中缓存部分按读取价格计费（约为普通输入的 10%）

**关键**：缓存命中依赖**消息数组前缀完全一致**。

### 当前问题

现有压缩逻辑将历史消息拼接成字符串，破坏了缓存前缀：

```
❌ 当前实现：
[
  { role: 'user', content: '请总结以下对话：\n用户: 消息1\nAI: 消息2\n...' }
]

每次压缩时，content 内容都不同 → 无法命中缓存
```

正确的做法：

```
✅ 缓存友好：
[
  { role: 'user', content: '消息1' },
  { role: 'assistant', content: '消息2' },
  ...
  { role: 'user', content: '请对以上对话进行总结' }
]

历史消息作为前缀保持不变 → 命中缓存
```

### 常见误区

**❌ 错误理解**：将消息拼接后放在指令后面就行了

```typescript
// 这样仍然无法命中缓存！
const content = `消息1\n消息2\n...\n\n请对以上对话进行总结`
messages = [{ role: 'user', content }]
```

问题：整个 content 是一个字符串，每次压缩时内容都不同，前缀无法匹配。

**✅ 正确做法**：保持消息数组结构

```typescript
// chatStream 接口调用
chatStream(
  modelName,
  systemPrompt,                           // ← 助手提示词（独立参数）
  [                                       // ← historyMessages（缓存前缀）
    { role: 'user', content: '消息1' },
    { role: 'assistant', content: '消息2' },
    ...
  ],
  '请对以上对话进行总结',                  // ← userMessage（压缩指令）
  ...
)
```

关键：`systemPrompt + historyMessages` 作为缓存前缀保持不变。

### SystemPrompt 处理注意事项

项目中 systemPrompt 有两种存在形式：
1. **独立参数**：`chatStream(modelName, systemPrompt, ...)`
2. **消息标记**：`MESSAGE_MARK.SYSTEM_PROMPT` 消息（用于对话维度固化 systemPrompt）

**当前问题**：
- 普通消息：过滤掉 `SYSTEM_PROMPT` 消息（第 152 行）
- 压缩请求：**未过滤** `SYSTEM_PROMPT` 消息（第 125-137 行）

这导致压缩请求时，`SYSTEM_PROMPT` 消息可能被当作普通消息发送，破坏缓存前缀。

**解决方案**：压缩请求时也必须过滤 `SYSTEM_PROMPT` 消息，确保：
```
API 请求 = systemPrompt (参数) + historyMessages (不含 SYSTEM_PROMPT 消息)
```

这样缓存前缀才能保持一致。

### 对比示意

```
压缩前（100条消息）：
┌─────────────────────────────────────┐
│ 系统提示词                           │
│ 消息 1-100                          │ ← 20,000 tokens
│ 用户新输入                           │
└─────────────────────────────────────┘

当前压缩方式（破坏缓存）：
┌─────────────────────────────────────┐
│ 系统提示词                           │
│ "请总结：消息1\n消息2\n..."          │ ← 拼接字符串，无法缓存
│ 压缩摘要                             │
│ 消息 97-100                         │
│ 用户新输入                           │
└─────────────────────────────────────┘

缓存友好的压缩方式：
┌─────────────────────────────────────┐
│ 系统提示词                           │
│ 消息 1-96                           │ ← 缓存命中！
│ "请对以上对话进行总结"               │
│ [生成] 压缩摘要                      │
│ 消息 97-100                         │
│ 用户新输入                           │
└─────────────────────────────────────┘
```

**Goal:** 修改对话压缩逻辑，使历史消息作为独立 message 对象保持在消息数组前缀，从而命中 Anthropic 缓存，降低输入成本

**Architecture:** 不再将历史消息拼接成字符串，而是保持消息数组结构，将压缩指令作为最后一条用户消息追加。压缩请求消息存储压缩指令文本，streamingTask 构建上下文时将历史消息 + 压缩指令一起发送。

**Tech Stack:** TypeScript, Nuxt 4, Drizzle ORM

---

## Task 1: 更新压缩 Prompt 常量

**Files:**
- Modify: `app/shared/constants.ts:742-750`

**Step 1: 移除占位符，改为纯指令文本**

修改 `DEFAULT_COMPRESS_PROMPT` 常量：

```typescript
export const DEFAULT_COMPRESS_PROMPT = `请将以上对话内容压缩为一份详细的摘要（约500-1000字），需要保留：
1. 讨论的主要话题和结论
2. 重要的技术细节、代码片段或配置信息
3. 用户的关键需求和偏好
4. 待解决的问题或后续任务

直接输出摘要内容，不要加标题或格式说明。`
```

**Step 2: 提交**

```bash
git add app/shared/constants.ts
git commit -m "refactor: 移除压缩 Prompt 中的占位符，改为纯指令文本"
```

---

## Task 2: 修改压缩请求接口

**Files:**
- Modify: `server/api/conversations/[id]/compress.post.ts:80-103`

**Step 1: 移除消息拼接逻辑**

删除第 80-86 行：

```typescript
// 删除这些行
const messagesContent = messagesToCompress
  .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
  .join('\n\n')

const finalPrompt = compressPrompt.replace('{messages}', messagesContent)
```

**Step 2: 更新压缩请求消息的 content**

修改第 96-103 行：

```typescript
const compressRequest = await conversationService.addMessage(user.id, {
  conversationId,
  role: 'user',
  content: compressPrompt,  // 直接存储压缩指令
  mark: MESSAGE_MARK.COMPRESS_REQUEST,
  sortId: compressRequestSortId,
})
```

**Step 3: 更新 startStreamingTask 调用参数**

修改第 147-161 行：

```typescript
setImmediate(() => {
  startStreamingTask({
    messageId: assistantMessage.id,
    userMessageId: compressRequest.id,  // 传递压缩请求消息 ID
    conversationId,
    userId: user.id,
    userContent: compressPrompt,  // 传递压缩指令
    userFiles: undefined,
    isCompressRequest: true,
    responseMark: MESSAGE_MARK.COMPRESS_RESPONSE,
    responseSortId,
  }).catch(err => {
    console.error('压缩流式生成任务失败:', err)
  })
})
```

**Step 4: 提交**

```bash
git add server/api/conversations/[id]/compress.post.ts
git commit -m "refactor: 压缩请求不再拼接消息,直接存储压缩指令"
```

---

## Task 3: 修改 streamingTask 的压缩请求处理逻辑

**Files:**
- Modify: `server/services/streamingTask.ts:125-156`

**Step 1: 修改压缩请求的消息构建逻辑**

找到第 125-138 行的压缩请求处理代码,修改为:

```typescript
if (isCompressRequest) {
  // 压缩请求:保持消息数组结构,不拼接
  const compressRequestIndex = result.messages.findIndex(m => m.mark === MESSAGE_MARK.COMPRESS_REQUEST)
  if (compressRequestIndex > 0) {
    let startIndex = 0
    for (let i = compressRequestIndex - 1; i >= 0; i--) {
      const msg = result.messages[i]
      if (msg && msg.mark === MESSAGE_MARK.COMPRESS_RESPONSE) {
        startIndex = i
        break
      }
    }
    // 包含从上次压缩点到压缩请求(包含压缩请求本身)
    historyMessages = result.messages.slice(startIndex, compressRequestIndex + 1)
  }
  // 过滤掉 SYSTEM_PROMPT 消息,避免重复
  historyMessages = historyMessages.filter(m => m.mark !== MESSAGE_MARK.SYSTEM_PROMPT)
} else {
```

**Step 2: 提交**

```bash
git add server/services/streamingTask.ts
git commit -m "refactor: 压缩请求保持消息数组结构并过滤 SYSTEM_PROMPT,实现缓存友好"
```

---

## Task 4: 更新文档

**Files:**
- Modify: `docs/features/对话压缩功能介绍.md:40-88`

**Step 1: 更新工作原理说明**

修改第 40-68 行,说明新的压缩机制:

```markdown
## 工作原理

### 压缩范围计算

假设当前有 100 条消息,压缩保留数为 4:

```
消息 1-96:待压缩的历史消息
消息 97-100:保留的最近消息
```

系统会将消息 1-96 保持为独立的消息对象,在最后追加一条压缩指令消息,一起发送给 AI 进行压缩。

### 压缩边界

**压缩边界**是压缩摘要在对话中的位置,它决定了后续请求的上下文起点:

压缩前的请求上下文:
```
系统提示词 + 消息 1-100 + 用户新输入
(约 20,000 tokens)
```

压缩后的请求上下文:
```
系统提示词 + 压缩摘要 + 消息 97-100 + 用户新输入
(约 3,000 tokens)
```

### 缓存优化

新的压缩机制对 Anthropic 缓存友好:历史消息作为独立的 message 对象保持在消息数组前缀,压缩指令追加在最后。这样可以命中缓存,大幅降低输入成本。
```

**Step 2: 更新多次压缩说明**

修改第 69-88 行:

```markdown
### 多次压缩

当对话再次变长时,您可以再次压缩。系统会从**上一次的压缩摘要**开始,生成"摘要的摘要":

**第一次压缩**(100 条消息):
- 压缩消息 1-96,生成摘要 A
- 保留消息 97-100

**第二次压缩**(假设又积累了 50 条,共 152 条):
- 将"摘要 A + 消息 97-148"作为消息数组,追加压缩指令
- 生成摘要 B
- 保留消息 149-152

这种方式的优点:
- ✅ 持续减少上下文大小
- ✅ 命中 API 缓存(历史消息作为前缀保持不变)
- ✅ 避免重复发送原始历史

注意事项:
- ⚠️ 多次压缩后可能丢失部分细节(摘要的摘要会更简化)
- 💡 如需保留完整历史,可在压缩前分叉对话
```

**Step 3: 提交**

```bash
git add docs/features/对话压缩功能介绍.md
git commit -m "docs: 更新压缩功能文档,说明缓存友好机制"
```

---

## Task 5: 运行测试

**Step 1: 运行单元测试**

```bash
pnpm test
```

预期:所有测试通过

**Step 2: 手动测试压缩功能**

1. 启动开发服务器:`pnpm dev`
2. 创建对话,发送 20+ 条消息
3. 点击"压缩对话"按钮
4. 验证压缩摘要生成成功
5. 发送新消息,验证对话正常

**Step 3: 如果测试失败,修复问题并重新测试**

---

## 完成

所有任务完成后,确认:
- ✅ 压缩指令不再拼接消息内容
- ✅ 历史消息作为独立对象保持在数组前缀
- ✅ 压缩功能正常工作
- ✅ 文档已更新
- ✅ 测试通过

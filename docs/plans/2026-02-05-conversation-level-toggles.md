# 对话级别思考/搜索开关实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将思考和搜索开关从助手级别迁移到对话级别，移除文件类型过滤让模型自行处理所有文件类型。

**Architecture:**
1. 数据库层：移除 `assistants.enableThinking`，为 `conversations` 添加 `enableThinking` 和 `enableWebSearch` 字段
2. 服务层：修改 `streamingTask.ts` 从对话读取开关，结合模型能力判断最终状态
3. 文件处理：移除 `isImageMimeType` 过滤，所有文件统一发送给模型

**Tech Stack:** Drizzle ORM, SQLite, TypeScript, Nuxt 4

---

## Task 1: 数据库迁移 - conversations 表添加开关字段

**Files:**
- Create: `server/database/migrations/XXXX_add-conversation-toggles.sql`

**Step 1: 创建迁移文件**

```bash
pnpm drizzle-kit generate --custom --name=add-conversation-toggles
```

**Step 2: 编写迁移 SQL**

```sql
-- 为 conversations 表添加思考和搜索开关字段
ALTER TABLE conversations ADD COLUMN enable_thinking INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE conversations ADD COLUMN enable_web_search INTEGER NOT NULL DEFAULT 0;
```

**Step 3: 执行迁移**

```bash
pnpm db:migrate
```

**Step 4: 验证迁移成功**

```bash
sqlite3 data/app.db ".schema conversations"
```
Expected: 看到 `enable_thinking` 和 `enable_web_search` 字段

**Step 5: Commit**

```bash
git add server/database/migrations/
git commit -m "feat: 为 conversations 表添加 enableThinking 和 enableWebSearch 字段"
```

---

## Task 2: 更新 schema.ts - conversations 表定义

**Files:**
- Modify: `server/database/schema.ts:145-157`

**Step 1: 修改 conversations 表定义**

在 `server/database/schema.ts` 的 `conversations` 表中添加两个字段：

```typescript
// 对话表
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  assistantId: integer('assistant_id').notNull(),
  title: text('title').notNull(),
  autoApproveMcp: integer('auto_approve_mcp', { mode: 'boolean' }).notNull().default(false),
  enableThinking: integer('enable_thinking', { mode: 'boolean' }).notNull().default(false), // 新增
  enableWebSearch: integer('enable_web_search', { mode: 'boolean' }).notNull().default(false), // 新增
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
```

**Step 2: 验证类型推断**

```bash
pnpm nuxt prepare
```
Expected: 无类型错误

**Step 3: Commit**

```bash
git add server/database/schema.ts
git commit -m "feat: schema.ts 添加 conversations.enableThinking/enableWebSearch 字段定义"
```

---

## Task 3: 数据库迁移 - 移除 assistants.enableThinking

**Files:**
- Create: `server/database/migrations/XXXX_remove-assistant-enable-thinking.sql`

**Step 1: 创建迁移文件**

```bash
pnpm drizzle-kit generate --custom --name=remove-assistant-enable-thinking
```

**Step 2: 编写迁移 SQL**

```sql
-- 移除 assistants 表的 enable_thinking 字段
ALTER TABLE assistants DROP COLUMN enable_thinking;
```

**Step 3: 执行迁移**

```bash
pnpm db:migrate
```

**Step 4: 验证迁移成功**

```bash
sqlite3 data/app.db ".schema assistants"
```
Expected: 不再看到 `enable_thinking` 字段

**Step 5: Commit**

```bash
git add server/database/migrations/
git commit -m "feat: 移除 assistants 表的 enableThinking 字段"
```

---

## Task 4: 更新 schema.ts - 移除 assistants.enableThinking

**Files:**
- Modify: `server/database/schema.ts:122-140`

**Step 1: 移除 assistants 表的 enableThinking 字段**

从 `assistants` 表定义中删除这一行：
```typescript
// 删除这行：
enableThinking: integer('enable_thinking', { mode: 'boolean' }).notNull().default(false),
```

**Step 2: 验证类型推断**

```bash
pnpm nuxt prepare
```
Expected: 可能有类型错误，需要在后续 Task 中修复

**Step 3: Commit**

```bash
git add server/database/schema.ts
git commit -m "feat: schema.ts 移除 assistants.enableThinking 字段定义"
```

---

## Task 5: 修复 assistant 服务层引用

**Files:**
- Modify: `server/services/assistant.ts`
- Modify: `server/api/assistants/[id].put.ts`

**Step 1: 搜索所有 enableThinking 引用**

```bash
grep -rn "enableThinking" server/services/assistant.ts server/api/assistants/
```

**Step 2: 修改 assistant.ts**

移除 `update` 方法中的 `enableThinking` 相关代码。

在 `server/services/assistant.ts` 中：
- 移除 `update` 方法参数中的 `enableThinking`
- 移除返回对象中的 `enableThinking` 字段

**Step 3: 修改 [id].put.ts**

在 `server/api/assistants/[id].put.ts` 中：
- 从 `readBody` 解构中移除 `enableThinking`
- 移除 `if (enableThinking !== undefined)` 相关代码块

**Step 4: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```
Expected: 无类型错误

**Step 5: Commit**

```bash
git add server/services/assistant.ts server/api/assistants/
git commit -m "fix: 移除 assistant 服务层的 enableThinking 引用"
```

---

## Task 6: 修改 streamingTask.ts - 从对话读取开关

**Files:**
- Modify: `server/services/streamingTask.ts:100-106`

**Step 1: 修改开关读取逻辑**

将原来的：
```typescript
// 从助手配置读取思考开关
const enableThinking = assistant.enableThinking || false

// 从模型能力读取 Web Search 开关
const enableWebSearch = aimodel.capabilities?.includes('web_search') || false
```

改为：
```typescript
// 从对话配置读取开关，结合模型能力判断最终状态
const modelSupportsThinking = aimodel.capabilities?.includes('reasoning') ?? false
const modelSupportsWebSearch = aimodel.capabilities?.includes('web_search') ?? false

// 对话开关 AND 模型能力 = 最终状态
const enableThinking = (conversation.enableThinking ?? false) && modelSupportsThinking
const enableWebSearch = (conversation.enableWebSearch ?? false) && modelSupportsWebSearch
```

**Step 2: 确认 conversation 对象可用**

检查 `startStreaming` 函数是否已有 `conversation` 参数，如果没有需要添加。

**Step 3: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add server/services/streamingTask.ts
git commit -m "feat: streamingTask 从对话级别读取思考/搜索开关"
```

---

## Task 7: 添加文件处理工具函数

**Files:**
- Modify: `server/services/file.ts`

**背景：** 新的文件处理策略需要根据文件类型智能选择处理方式：
1. 图片 (image/*, 但 SVG 除外) → 作为图片块发送
2. PDF (application/pdf) → Claude/Gemini 作为文档块，OpenAI 作为文本嵌入
3. 其他文件 → 读取为文本嵌入消息（大于 20KB 需前端确认）

**Step 1: 添加文件分类和读取函数**

在 `server/services/file.ts` 中添加：

```typescript
// 文件大小阈值：超过此大小的文本文件需要用户确认
export const TEXT_FILE_SIZE_THRESHOLD = 20 * 1024 // 20KB

// 判断是否为图片类型（SVG 除外，因为 SVG 本质是文本）
export function isNativeImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

// 判断是否为 PDF
export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

// 读取文件为文本内容（用于嵌入消息）
export function readFileAsText(fileName: string): { content: string; size: number } | null {
  const result = readFile(fileName)
  if (!result) return null

  try {
    const content = result.buffer.toString('utf-8')
    return { content, size: result.size }
  } catch {
    return null
  }
}

// 获取文件大小
export function getFileSize(fileName: string): number | null {
  const result = readFile(fileName)
  return result?.size ?? null
}
```

**Step 2: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 3: Commit**

```bash
git add server/services/file.ts
git commit -m "feat: 添加文件分类和文本读取工具函数"
```

---

## Task 8: 智能文件处理 - Claude Provider

**Files:**
- Modify: `server/services/chatProviders/claude.ts`

**Step 1: 更新类型定义**

添加 document 类型到 ClaudeContentBlock：

```typescript
type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }
```

**Step 2: 修改 filesToClaudeContent 函数**

```typescript
import { readFileAsBase64, readFileAsText, isNativeImageMimeType, isPdfMimeType } from '../file'

function filesToClaudeContent(files: MessageFile[]): ClaudeContentBlock[] {
  const contents: ClaudeContentBlock[] = []

  for (const file of files) {
    // 1. 图片类型（非 SVG）→ 作为图片块
    if (isNativeImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match?.[1] && match[2]) {
          contents.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1], data: match[2] },
          })
        }
      }
      continue
    }

    // 2. PDF → 作为文档块
    if (isPdfMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match?.[1] && match[2]) {
          contents.push({
            type: 'document',
            source: { type: 'base64', media_type: match[1], data: match[2] },
          })
        }
      }
      continue
    }

    // 3. 其他文件 → 读取为文本嵌入
    const textResult = readFileAsText(file.fileName)
    if (textResult) {
      const ext = file.fileName.split('.').pop() || ''
      contents.push({
        type: 'text',
        text: `[文件: ${file.fileName}]\n\`\`\`${ext}\n${textResult.content}\n\`\`\``,
      })
    }
  }

  return contents
}
```

**Step 3: 移除 isImageMimeType 导入**

**Step 4: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 5: Commit**

```bash
git add server/services/chatProviders/claude.ts
git commit -m "feat: Claude provider 智能文件处理（图片/PDF/文本）"
```

---

## Task 9: 智能文件处理 - Gemini Provider

**Files:**
- Modify: `server/services/chatProviders/gemini.ts`

**Step 1: 修改 filesToGeminiParts 函数**

Gemini 的 inlineData 支持更多格式，但我们仍然对文本文件特殊处理：

```typescript
import { readFileAsBase64, readFileAsText, isNativeImageMimeType, isPdfMimeType } from '../file'

function filesToGeminiParts(files: MessageFile[]): GeminiPart[] {
  const parts: GeminiPart[] = []

  for (const file of files) {
    // 1. 图片类型（非 SVG）→ 作为 inlineData
    if (isNativeImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match?.[1] && match[2]) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
        }
      }
      continue
    }

    // 2. PDF → 作为 inlineData（Gemini 支持 PDF）
    if (isPdfMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/)
        if (match?.[1] && match[2]) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
        }
      }
      continue
    }

    // 3. 其他文件 → 读取为文本
    const textResult = readFileAsText(file.fileName)
    if (textResult) {
      const ext = file.fileName.split('.').pop() || ''
      parts.push({ text: `[文件: ${file.fileName}]\n\`\`\`${ext}\n${textResult.content}\n\`\`\`` })
    }
  }

  return parts
}
```

**Step 2: 移除 isImageMimeType 导入**

**Step 3: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add server/services/chatProviders/gemini.ts
git commit -m "feat: Gemini provider 智能文件处理（图片/PDF/文本）"
```

---

## Task 10: 智能文件处理 - OpenAI Chat Provider

**Files:**
- Modify: `server/services/chatProviders/openaiChat.ts`

**Step 1: 修改 filesToContent 函数**

OpenAI 不支持 PDF，所有非图片文件都作为文本嵌入：

```typescript
import { readFileAsBase64, readFileAsText, isNativeImageMimeType } from '../file'

function filesToContent(files: MessageFile[]): ChatMessageContent[] {
  const contents: ChatMessageContent[] = []

  for (const file of files) {
    // 1. 图片类型（非 SVG）→ 作为 image_url
    if (isNativeImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        contents.push({
          type: 'image_url',
          image_url: { url: base64, detail: 'auto' },
        })
      }
      continue
    }

    // 2. 其他文件（包括 PDF）→ 读取为文本嵌入
    const textResult = readFileAsText(file.fileName)
    if (textResult) {
      const ext = file.fileName.split('.').pop() || ''
      contents.push({
        type: 'text',
        text: `[文件: ${file.fileName}]\n\`\`\`${ext}\n${textResult.content}\n\`\`\``,
      })
    }
  }

  return contents
}
```

**Step 2: 移除 isImageMimeType 导入**

**Step 3: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add server/services/chatProviders/openaiChat.ts
git commit -m "feat: OpenAI Chat provider 智能文件处理（图片/文本）"
```

---

## Task 10.5: 智能文件处理 - OpenAI Response Provider

**Files:**
- Modify: `server/services/chatProviders/openaiResponse.ts`

**Step 1: 更新类型定义**

添加 input_text 类型：

```typescript
type ResponseMessageContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }
```

**Step 2: 修改 filesToContent 函数**

```typescript
import { readFileAsBase64, readFileAsText, isNativeImageMimeType } from '../file'

function filesToContent(files: MessageFile[]): ResponseMessageContent[] {
  const contents: ResponseMessageContent[] = []

  for (const file of files) {
    // 1. 图片类型（非 SVG）→ 作为 input_image
    if (isNativeImageMimeType(file.mimeType)) {
      const base64 = readFileAsBase64(file.fileName)
      if (base64) {
        contents.push({
          type: 'input_image',
          image_url: base64,
          detail: 'auto',
        })
      }
      continue
    }

    // 2. 其他文件 → 读取为文本嵌入
    const textResult = readFileAsText(file.fileName)
    if (textResult) {
      const ext = file.fileName.split('.').pop() || ''
      contents.push({
        type: 'input_text',
        text: `[文件: ${file.fileName}]\n\`\`\`${ext}\n${textResult.content}\n\`\`\``,
      })
    }
  }

  return contents
}
```

**Step 3: 移除 isImageMimeType 导入**

**Step 4: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 5: Commit**

```bash
git add server/services/chatProviders/openaiResponse.ts
git commit -m "feat: OpenAI Response provider 智能文件处理（图片/文本）"
```

---

## Task 10.6: 前端大文件确认机制

**Files:**
- Modify: 文件上传相关组件

**背景：** 非图片和 PDF 的文件如果大于 20KB，需要在前端提示用户确认。

**Step 1: 在文件上传时检查大小**

在上传文件的组件中添加检查逻辑：

```typescript
const TEXT_FILE_SIZE_THRESHOLD = 20 * 1024 // 20KB

function isNativeImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

function isPdfMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

// 在文件选择后检查
async function handleFileSelect(file: File) {
  // 图片和 PDF 不需要确认
  if (isNativeImageMimeType(file.type) || isPdfMimeType(file.type)) {
    return uploadFile(file)
  }

  // 其他文件超过阈值需要确认
  if (file.size > TEXT_FILE_SIZE_THRESHOLD) {
    const confirmed = await confirmDialog({
      title: '大文件确认',
      message: `文件 "${file.name}" 大小为 ${(file.size / 1024).toFixed(1)}KB，将作为文本嵌入对话上下文。这可能占用较多上下文空间，是否继续？`,
    })
    if (!confirmed) return
  }

  return uploadFile(file)
}
```

**Step 2: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 3: Commit**

```bash
git add app/
git commit -m "feat: 前端添加大文件上传确认机制"
```

---

## Task 11: 添加对话 API - 更新开关接口

**Files:**
- Modify: `server/api/conversations/[id].put.ts` (如果存在)
- 或 Create: `server/api/conversations/[id].patch.ts`

**Step 1: 检查现有 API**

```bash
ls -la server/api/conversations/
```

**Step 2: 添加/修改更新接口支持新字段**

确保 PUT/PATCH 接口支持更新 `enableThinking` 和 `enableWebSearch` 字段：

```typescript
const { enableThinking, enableWebSearch, ...otherFields } = await readBody(event)

const updateData: Record<string, unknown> = {}

if (enableThinking !== undefined) {
  updateData.enableThinking = enableThinking
}

if (enableWebSearch !== undefined) {
  updateData.enableWebSearch = enableWebSearch
}
```

**Step 3: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add server/api/conversations/
git commit -m "feat: 对话 API 支持更新 enableThinking/enableWebSearch 字段"
```

---

## Task 12: 前端类型更新

**Files:**
- Check: `app/shared/types.ts` 是否有 Conversation 类型定义需要更新

**Step 1: 搜索 Conversation 类型定义**

```bash
grep -rn "interface.*Conversation" app/
grep -rn "type.*Conversation" app/
```

**Step 2: 如果有独立类型定义，添加新字段**

```typescript
interface Conversation {
  // ... 现有字段
  enableThinking: boolean
  enableWebSearch: boolean
}
```

**Step 3: 验证前端编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add app/
git commit -m "feat: 前端类型添加对话级别开关字段"
```

---

## Task 13: 运行测试验证

**Files:**
- Test: 现有测试文件

**Step 1: 运行所有测试**

```bash
pnpm test
```

**Step 2: 修复失败的测试**

根据测试失败情况进行修复，可能需要：
- 更新测试中的 mock 数据
- 移除对 `assistant.enableThinking` 的断言

**Step 3: Commit**

```bash
git add .
git commit -m "test: 修复因开关迁移导致的测试失败"
```

---

## Task 14: 清理 - 移除未使用的 isImageMimeType

**Files:**
- Modify: `server/services/file.ts` (如果该函数不再被任何地方使用)

**Step 1: 检查 isImageMimeType 使用情况**

```bash
grep -rn "isImageMimeType" server/ app/
```

**Step 2: 如果只在 chatProviders 中使用且已移除，则从 file.ts 移除导出**

保留函数但不导出，或完全移除（取决于是否有其他用途）。

**Step 3: 验证编译**

```bash
pnpm nuxt prepare && pnpm typecheck
```

**Step 4: Commit**

```bash
git add server/services/file.ts
git commit -m "chore: 清理未使用的 isImageMimeType 函数"
```

---

## 验收标准

1. ✅ `conversations` 表有 `enable_thinking` 和 `enable_web_search` 字段
2. ✅ `assistants` 表没有 `enable_thinking` 字段
3. ✅ `streamingTask.ts` 从对话读取开关并结合模型能力判断
4. ✅ 所有 chatProvider 不过滤文件类型
5. ✅ 所有测试通过
6. ✅ TypeScript 编译无错误

# 对话图片 URL 引用实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 解决对话中连续图片编辑时 base64 导致 token 超限的问题，改用公网 URL 引用图片。

**Architecture:**
1. 扩展 `MessageFile` 类型增加 `publicUrl` 字段
2. 对话模型返回 base64 图片时，保存到本地并生成公网 URL
3. 构建历史消息时，使用公网 URL 替代 base64

**Tech Stack:** TypeScript, Nuxt 3, OpenAI Chat API 格式

---

## 背景

当前问题：对话中生成的图片以 base64 形式嵌入消息历史，中转站将其当作普通文本计算 token，导致 `The input token count exceeds the maximum number of tokens allowed (131072)` 错误。

已验证方案：中转站支持通过公网 URL 引用图片，token 消耗从几十万降到几百。

测试命令：
```bash
curl -s "https://antigravity.jjcc.fun/v1/chat/completions" \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-image",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "https://mj.jjcc.fun/api/files/xxx.jpg"}},
        {"type": "text", "text": "将水果换成钻石"}
      ]
    }]
  }'
```

---

## Task 1: 扩展 MessageFile 类型

**Files:**
- Modify: `app/shared/types.ts:194-203`

**Step 1: 添加 publicUrl 字段**

在 `MessageFile` 接口中添加可选的 `publicUrl` 字段：

```typescript
export interface MessageFile {
  /** 原始文件名 */
  name: string
  /** 存储文件名（服务器生成的唯一名称） */
  fileName: string
  /** MIME 类型 */
  mimeType: string
  /** 文件大小（字节） */
  size: number
  /** 公网访问 URL（用于 API 请求时替代 base64） */
  publicUrl?: string
}
```

**Step 2: 验证类型定义**

Run: `cd /data/projects/mj-studio && pnpm typecheck`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add app/shared/types.ts
git commit -m "feat: MessageFile 增加 publicUrl 字段支持 URL 引用"
```

---

## Task 2: 创建图片保存并生成公网 URL 的工具函数

**Files:**
- Modify: `server/services/file.ts`

**Step 1: 添加 saveBase64FileWithUrl 函数**

在 `server/services/file.ts` 文件末尾添加：

```typescript
import { getFullResourceUrl } from '../utils/url'

/**
 * 从 base64 保存文件并返回包含公网 URL 的 MessageFile
 * 用于对话生图场景，需要将图片 URL 传回给 API
 */
export function saveBase64FileWithUrl(base64Data: string, originalName?: string): MessageFile | null {
  const result = saveBase64File(base64Data, originalName)
  if (!result) return null

  const localUrl = getFileUrl(result.fileName)
  const publicUrl = getFullResourceUrl(localUrl)

  return {
    name: originalName || result.fileName,
    fileName: result.fileName,
    mimeType: result.mimeType,
    size: result.size,
    publicUrl: publicUrl || undefined,
  }
}
```

**Step 2: 添加类型导入**

在文件顶部添加：

```typescript
import type { MessageFile } from '../../app/shared/types'
```

**Step 3: 验证编译**

Run: `cd /data/projects/mj-studio && pnpm typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add server/services/file.ts
git commit -m "feat: 添加 saveBase64FileWithUrl 支持生成公网 URL"
```

---

## Task 3: 修改 openaiChat.ts 使用公网 URL

**Files:**
- Modify: `server/services/chatProviders/openaiChat.ts:42-70`

**Step 1: 修改 filesToContent 函数**

将图片处理逻辑改为优先使用 `publicUrl`：

```typescript
// 将文件转换为多模态消息内容（智能处理图片/文本）
function filesToContent(files: MessageFile[]): ChatMessageContent[] {
  const contents: ChatMessageContent[] = []

  for (const file of files) {
    // 1. 图片类型（非 SVG）→ 作为 image_url
    if (isNativeImageMimeType(file.mimeType)) {
      // 优先使用公网 URL，避免 base64 导致 token 超限
      if (file.publicUrl) {
        contents.push({
          type: 'image_url',
          image_url: { url: file.publicUrl, detail: 'auto' },
        })
      } else {
        // 降级：使用 base64（兼容旧数据）
        const base64 = readFileAsBase64(file.fileName)
        if (base64) {
          contents.push({
            type: 'image_url',
            image_url: { url: base64, detail: 'auto' },
          })
        }
      }
      continue
    }

    // 2. 其他文件（包括 PDF、SVG、文本等）→ 读取为文本嵌入
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

**Step 2: 验证编译**

Run: `cd /data/projects/mj-studio && pnpm typecheck`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add server/services/chatProviders/openaiChat.ts
git commit -m "feat: filesToContent 优先使用公网 URL 替代 base64"
```

---

## Task 4: 修改 gemini.ts 使用公网 URL（如适用）

**Files:**
- Modify: `server/services/chatProviders/gemini.ts`

**Step 1: 检查 Gemini 是否支持 URL**

根据之前调查，Gemini 原生 API 不支持 URL，只支持 `inlineData`（base64）或 `file_data`（File API）。

**如果项目使用 Gemini 原生格式**，暂不修改，保持 base64 方式。
**如果通过中转站使用 OpenAI 格式调用 Gemini**，则已被 Task 3 覆盖。

**Step 2: 确认当前使用方式**

查看 `gemini.ts` 中的 `filesToGeminiParts` 函数，如果项目主要通过中转站调用，此任务可跳过。

---

## Task 5: 处理对话模型返回的 base64 图片

**Files:**
- 需要调查：对话流式响应处理逻辑在哪里

**Step 1: 定位响应处理代码**

需要找到处理 `![image](data:image/...base64...)` 格式响应的代码，在保存消息前：
1. 提取 base64 图片
2. 调用 `saveBase64FileWithUrl` 保存并生成 URL
3. 将 base64 替换为本地 URL 或创建 MessageFile 记录

**Step 2: 实现图片提取和保存**

这部分需要进一步调查消息保存流程，确定在哪个文件中处理。

可能的位置：
- `server/api/conversations/[id]/messages.post.ts`
- 消息服务层

---

## Task 6: 测试验证

**Step 1: 创建测试用例**

```typescript
// tests/integration/conversation-image-url.test.ts
import { describe, it, expect } from 'vitest'
import { saveBase64FileWithUrl } from '../../server/services/file'

describe('对话图片 URL 引用', () => {
  it('saveBase64FileWithUrl 应返回包含 publicUrl 的 MessageFile', () => {
    const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    const result = saveBase64FileWithUrl(testBase64)

    expect(result).not.toBeNull()
    expect(result?.fileName).toMatch(/\.png$/)
    expect(result?.mimeType).toBe('image/png')
    // publicUrl 取决于 PUBLIC_URL 配置
  })
})
```

**Step 2: 运行测试**

Run: `cd /data/projects/mj-studio && pnpm test`
Expected: 测试通过

**Step 3: 手动测试**

1. 启动开发服务器
2. 创建对话，让模型生成图片
3. 继续对话要求修改图片
4. 验证不再出现 token 超限错误

---

## 实现优先级

1. **Task 1-3**：核心功能，必须完成
2. **Task 4**：根据实际使用的 API 格式决定
3. **Task 5**：需要进一步调查消息处理流程
4. **Task 6**：验证整体功能

---

## 注意事项

1. **向后兼容**：`publicUrl` 是可选字段，旧数据仍可通过 base64 方式处理
2. **PUBLIC_URL 配置**：确保 `.env` 中配置了正确的公网域名
3. **中转站访问**：确保中转站能访问项目的公网 URL

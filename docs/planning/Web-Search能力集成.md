# Web Search 能力集成实现计划

## 概述

为 AI 对话应用集成 Web Search（联网搜索）能力，首先实现 Claude 提供商，后续扩展到 OpenAI 和 Gemini。

## 设计决策

### 能力来源

**从 `aimodel.capabilities` 读取**，而非在助手表添加开关：
- `aimodels` 表已有 `capabilities: ModelCapability[]` 字段
- `ModelCapability` 已包含 `'web_search'` 类型
- 能力跟随模型配置，用户可在模型设置中启用/禁用
- 无需数据库迁移

### 实现范围

**第一阶段（本次）**：Claude Web Search
**后续阶段**：OpenAI、Gemini、Perplexity 等

---

## 实现步骤

### 步骤 1：扩展类型系统

**文件**：`server/services/chatProviders/types.ts`

```typescript
/** Web Search 结果项 */
export interface WebSearchResultItem {
  url: string
  title: string
  pageAge?: string
}

/** 流式响应块（扩展） */
export interface ChatStreamChunk {
  content: string
  thinking?: string
  done: boolean
  // 新增
  webSearch?: {
    status: 'searching' | 'completed'
    results?: WebSearchResultItem[]
  }
}
```

---

### 步骤 2：添加 Web Search 能力推断

**文件**：`app/shared/model-inference.ts`

在 `inferCapabilities` 函数中添加 `web_search` 能力匹配：

```typescript
const WEB_SEARCH_PATTERNS = [
  // Claude
  /claude-3[.-]5-sonnet/i,
  /claude-3[.-]7-sonnet/i,
  /claude-3[.-]5-haiku/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /claude-haiku-4/i,
  // OpenAI（预留）
  /gpt-4o-search/i,
  /gpt-4\.1/i,
  // Gemini（预留）
  /gemini-2/i,
  /gemini-3/i,
  // Grok
  /grok/i,
  // Perplexity
  /sonar/i,
]

// 在 inferCapabilities 中添加
if (WEB_SEARCH_PATTERNS.some(p => p.test(modelId))) {
  capabilities.push('web_search')
}
```

---

### 步骤 3：修改 Claude 适配器

**文件**：`server/services/chatProviders/claude.ts`

#### 3.1 修改 chatStream 签名

```typescript
async *chatStream(
  // ... 现有参数
  enableThinking?: boolean,
  enableWebSearch?: boolean  // 新增
): AsyncGenerator<ChatStreamChunk>
```

#### 3.2 添加 web_search tool

```typescript
if (enableWebSearch) {
  body.tools = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    },
  ]
}
```

#### 3.3 处理流式搜索事件

```typescript
if (parsed.type === 'content_block_start') {
  const block = parsed.content_block

  // 搜索开始
  if (block?.type === 'server_tool_use' && block?.name === 'web_search') {
    yield { content: '', done: false, webSearch: { status: 'searching' } }
  }

  // 搜索结果
  if (block?.type === 'web_search_tool_result') {
    const results = (block.content || [])
      .filter((item: any) => item.type === 'web_search_result')
      .map((item: any) => ({
        url: item.url,
        title: item.title,
        pageAge: item.page_age,
      }))
    yield { content: '', done: false, webSearch: { status: 'completed', results } }
  }
}
```

---

### 步骤 4：更新 ChatService 接口

**文件**：`server/services/chatProviders/types.ts`

更新 `chatStream` 方法签名，添加 `enableWebSearch` 参数。

同步更新 `openaiChat.ts` 和 `gemini.ts` 签名（暂不实现功能）。

---

### 步骤 5：修改流式任务处理

**文件**：`server/services/streamingTask.ts`

#### 5.1 从模型能力读取 Web Search 开关

```typescript
const aimodel = await aimodelService.getById(assistant.aimodelId)
const enableWebSearch = aimodel.capabilities?.includes('web_search') || false
```

#### 5.2 传递参数并处理 chunk

```typescript
const generator = chatService.chatStream(
  // ... 现有参数
  enableThinking,
  enableWebSearch
)

// 处理 webSearch chunk
if (chunk.webSearch) {
  if (chunk.webSearch.status === 'searching') {
    appendStreamingContent(messageId, '\n```web-search\nstatus: searching\n```\n\n')
  } else if (chunk.webSearch.status === 'completed' && chunk.webSearch.results) {
    const json = JSON.stringify(chunk.webSearch.results)
    appendStreamingContent(messageId, `\n\`\`\`web-search\nstatus: completed\nresults: ${json}\n\`\`\`\n\n`)
  }
}
```

---

### 步骤 6：前端渲染组件

**新建文件**：`app/components/chat/WebSearchResults.vue`

显示搜索状态和结果列表，包含：
- 搜索中动画
- 结果数量统计
- 来源链接（favicon + 标题 + 时间）

---

### 步骤 7：修改 StreamMarkdown.vue

**文件**：`app/components/chat/StreamMarkdown.vue`

- `renderToken` 添加 `web-search` 类型处理
- `BlockState` 添加 `webSearchData` 字段
- 模板添加 `WebSearchResults` 组件渲染

---

## 关键文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `server/services/chatProviders/types.ts` | 修改 | 扩展 ChatStreamChunk |
| `app/shared/model-inference.ts` | 修改 | 添加 web_search 推断 |
| `server/services/chatProviders/claude.ts` | 修改 | 核心实现 |
| `server/services/chatProviders/openaiChat.ts` | 修改 | 更新签名 |
| `server/services/chatProviders/gemini.ts` | 修改 | 更新签名 |
| `server/services/streamingTask.ts` | 修改 | 处理 webSearch |
| `app/components/chat/WebSearchResults.vue` | 新建 | 前端组件 |
| `app/components/chat/StreamMarkdown.vue` | 修改 | 渲染支持 |

---

## 验证方式

1. **类型检查**：`npx vue-tsc --noEmit`
2. **功能测试**：
   - 配置模型时添加 `web_search` 能力
   - 使用 Claude 模型发送搜索问题
   - 验证搜索状态和结果渲染

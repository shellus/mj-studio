# Web Search 能力集成指南

本文档描述如何在 AI 对话应用中集成各提供商的 Web Search（联网搜索）能力。

## 目录

1. [能力判断](#1-能力判断)
2. [请求搜索](#2-请求搜索)
3. [渲染搜索结果](#3-渲染搜索结果)
4. [各提供商详细实现](#4-各提供商详细实现)

---

## 1. 能力判断

### 1.1 判断逻辑概述

判断模型是否支持 Web Search 需要考虑：

1. **排除不相关模型**：Embedding、Rerank、图像生成模型不支持
2. **用户手动设置优先**：如果用户明确设置了能力，优先使用
3. **按提供商 + 模型ID判断**：不同提供商有不同的支持规则

### 1.2 通用判断函数

```typescript
function isWebSearchModel(model: Model): boolean {
  // 1. 排除不相关模型类型
  if (isEmbeddingModel(model) || isRerankModel(model) || isTextToImageModel(model)) {
    return false
  }

  // 2. 用户手动设置优先
  if (model.capabilities?.find(c => c.type === 'web_search' && c.isUserSelected)) {
    return model.capabilities.find(c => c.type === 'web_search')!.isUserSelected!
  }

  // 3. 按提供商判断
  const providerId = model.provider
  const modelId = model.id.toLowerCase()

  switch (providerId) {
    case 'anthropic':
      return isClaudeWebSearchModel(modelId)
    case 'openai':
      return isOpenAIWebSearchModel(modelId)
    case 'gemini':
      return isGeminiWebSearchModel(modelId)
    case 'perplexity':
      return isPerplexityWebSearchModel(modelId)
    // ... 其他提供商
    default:
      return false
  }
}
```

### 1.3 各提供商支持规则

#### Anthropic (Claude)

```typescript
const CLAUDE_WEBSEARCH_REGEX = /\b(?:
  claude-3[.-](7|5)-sonnet(?:-[\w-]+)?|
  claude-3[.-]5-haiku(?:-[\w-]+)?|
  claude-(haiku|sonnet|opus)-4(?:-[\w-]+)?
)\b/i

function isClaudeWebSearchModel(modelId: string): boolean {
  return CLAUDE_WEBSEARCH_REGEX.test(modelId)
}
```

**支持的模型：**
| 模型 | 支持情况 |
|------|---------|
| claude-3.5-sonnet | ✅ |
| claude-3.7-sonnet | ✅ |
| claude-3.5-haiku | ✅ |
| claude-sonnet-4 | ✅ |
| claude-opus-4 | ✅ |
| claude-haiku-4 | ✅ |
| claude-3-opus | ❌ |
| AWS Bedrock 上的 Claude | ❌ |

#### OpenAI

```typescript
function isOpenAIWebSearchModel(modelId: string): boolean {
  return (
    modelId.includes('gpt-4o-search-preview') ||
    modelId.includes('gpt-4o-mini-search-preview') ||
    (modelId.includes('gpt-4.1') && !modelId.includes('gpt-4.1-nano')) ||
    (modelId.includes('gpt-4o') && !modelId.includes('gpt-4o-image')) ||
    modelId.includes('o3') ||
    modelId.includes('o4') ||
    (modelId.includes('gpt-5') && !modelId.includes('chat'))
  )
}
```

**支持的模型：**
- gpt-4o-search-preview, gpt-4o-mini-search-preview
- gpt-4.1, gpt-4.1-mini（不含 nano）
- gpt-4o（不含 image 变体）
- o3, o3-mini, o4, o4-mini
- gpt-5 系列（不含 chat 变体）

#### Google Gemini

```typescript
const GEMINI_SEARCH_REGEX = /gemini-(?:
  2(?!.*-image-preview).*(?:-latest)?|
  3(?:\.\d+)?-(?:flash|pro)(?:-(?:image-)?preview)?|
  flash-latest|pro-latest|flash-lite-latest
)(?:-[\w-]+)*$/i

function isGeminiWebSearchModel(modelId: string): boolean {
  return GEMINI_SEARCH_REGEX.test(modelId)
}
```

**支持的模型：**
- gemini-2.0-flash, gemini-2.5-pro, gemini-2.5-flash
- gemini-3-flash, gemini-3-pro
- **不支持**：gemini-2.5-flash-image-preview（图像生成模型）

#### Perplexity

```typescript
const PERPLEXITY_MODELS = [
  'sonar-pro',
  'sonar',
  'sonar-reasoning',
  'sonar-reasoning-pro',
  'sonar-deep-research'
]

function isPerplexityWebSearchModel(modelId: string): boolean {
  return PERPLEXITY_MODELS.includes(modelId)
}
```

**注意**：Perplexity 模型是 **强制搜索**，无法关闭。

#### 其他提供商

| 提供商 | 判断规则 |
|--------|---------|
| OpenRouter | 全部支持（透传原模型能力） |
| Grok (xAI) | 全部支持 |
| 阿里云 DashScope | qwen-turbo, qwen-max, qwen-plus, qwq, qwen-flash, qwen3-max |
| 智谱 | glm-4-* 开头的模型 |
| 腾讯混元 | 除 hunyuan-lite 外全部支持 |

---

## 2. 请求搜索

### 2.1 Anthropic (Claude)

Claude 使用 **Server Tool**（服务端工具）方式，无需客户端执行搜索。

```typescript
interface WebSearchTool {
  type: 'web_search_20250305'
  name: 'web_search'
  max_uses?: number  // 可选，限制搜索次数，默认无限制
}

// 请求示例
const request = {
  model: 'claude-opus-4-20250514',
  max_tokens: 8192,
  stream: true,
  system: [{ type: 'text', text: '你是一个有用的助手。' }],
  messages: [
    { role: 'user', content: '今天有什么科技新闻？' }
  ],
  tools: [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5  // 每次对话最多搜索5次
    },
    // ... 其他MCP工具（可选）
  ]
}

// 使用 Anthropic SDK
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: 'your-api-key' })
const stream = client.messages.stream(request)
```

### 2.2 OpenAI

OpenAI 使用 **Response API** 或 **Chat Completion with web_search_preview**。

#### Response API 方式

```typescript
const request = {
  model: 'gpt-4o',
  input: '今天有什么科技新闻？',
  tools: [{ type: 'web_search_preview' }]
}

// 使用 OpenAI SDK
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: 'your-api-key' })
const response = await client.responses.create(request)
```

#### Chat Completion 方式（search-preview 模型）

```typescript
const request = {
  model: 'gpt-4o-search-preview',
  messages: [
    { role: 'user', content: '今天有什么科技新闻？' }
  ],
  web_search_options: {
    search_context_size: 'medium'  // 'low' | 'medium' | 'high'
  }
}

const response = await client.chat.completions.create(request)
```

**Chat Completion 响应格式（流式）：**

搜索引用通过 `delta.annotations` 字段返回：

```typescript
// 流式响应 chunk 示例
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "choices": [{
    "index": 0,
    "delta": {
      "content": "根据最新消息，OpenAI 发布了...",
      "annotations": [
        {
          "type": "url_citation",
          "url": "https://example.com/news/openai",
          "title": "OpenAI 最新动态",
          "start_index": 8,   // 引用在文本中的起始位置
          "end_index": 25     // 引用在文本中的结束位置
        }
      ]
    },
    "finish_reason": null
  }]
}

// 最终 chunk（包含 finish_reason）
{
  "choices": [{
    "index": 0,
    "delta": {},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 200,
    "total_tokens": 250
  }
}
```

**Chat Completion 响应格式（非流式）：**

```typescript
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "根据最新消息，OpenAI 发布了...",
      "annotations": [
        {
          "type": "url_citation",
          "url": "https://example.com/news/openai",
          "title": "OpenAI 最新动态",
          "start_index": 8,
          "end_index": 25
        },
        {
          "type": "url_citation",
          "url": "https://example.com/tech/ai",
          "title": "AI 行业报告",
          "start_index": 50,
          "end_index": 80
        }
      ]
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 200,
    "total_tokens": 250
  }
}
```

**annotations 字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 固定为 `"url_citation"` |
| url | string | 引用来源的 URL |
| title | string | 引用来源的标题 |
| start_index | number | 引用文本在 content 中的起始字符位置 |
| end_index | number | 引用文本在 content 中的结束字符位置 |

### 2.3 Google Gemini

Gemini 使用 `google_search` 工具。

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI('your-api-key')
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ googleSearch: {} }]  // 启用搜索
})

const result = await model.generateContent('今天有什么科技新闻？')
```

### 2.4 Perplexity

Perplexity 模型自带搜索能力，无需额外配置。

```typescript
// 使用 OpenAI 兼容 API
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'your-perplexity-api-key',
  baseURL: 'https://api.perplexity.ai'
})

const response = await client.chat.completions.create({
  model: 'sonar-pro',
  messages: [
    { role: 'user', content: '今天有什么科技新闻？' }
  ]
})
// 响应自动包含搜索结果和引用
```

### 2.5 阿里云 DashScope

```typescript
const request = {
  model: 'qwen-max',
  input: {
    messages: [
      { role: 'user', content: '今天有什么科技新闻？' }
    ]
  },
  parameters: {
    enable_search: true  // 启用搜索
  }
}
```

---

## 3. 渲染搜索结果

### 3.1 响应数据结构

#### Anthropic (Claude)

**流式响应事件序列：**

```typescript
// 1. 开始搜索
{
  type: 'content_block_start',
  content_block: {
    type: 'server_tool_use',
    id: 'srvtoolu_xxx',
    name: 'web_search'
  }
}

// 2. 搜索完成，返回结果
{
  type: 'content_block_start',
  content_block: {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_xxx',
    content: [
      {
        type: 'web_search_result',
        url: 'https://example.com/article1',
        title: '文章标题',
        encrypted_content: '...',  // 加密的内容摘要
        page_age: '2 hours ago'
      },
      // ... 更多结果
    ]
  }
}

// 3. 基于搜索结果的回答
{
  type: 'content_block_start',
  content_block: { type: 'text' }
}
{
  type: 'content_block_delta',
  delta: { type: 'text_delta', text: '根据最新的搜索结果...' }
}
```

**搜索结果类型定义：**

```typescript
interface WebSearchResult {
  type: 'web_search_result'
  url: string
  title: string
  encrypted_content: string  // Base64 加密，无法直接显示
  page_age?: string          // 如 "2 hours ago"
}

interface WebSearchToolResult {
  type: 'web_search_tool_result'
  tool_use_id: string
  content: WebSearchResult[]
}
```

#### OpenAI

```typescript
interface OpenAISearchResult {
  type: 'url_citation'
  url: string
  title: string
  start_index: number  // 在回答文本中的起始位置
  end_index: number    // 在回答文本中的结束位置
}

// Response API 返回格式
interface ResponseOutput {
  output: [
    {
      type: 'web_search_call',
      id: 'ws_xxx',
      status: 'completed'
    },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: '根据搜索结果...',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://example.com',
              title: '来源标题',
              start_index: 10,
              end_index: 50
            }
          ]
        }
      ]
    }
  ]
}
```

### 3.2 UI 渲染示例

#### React 组件示例

```tsx
interface WebSearchResult {
  url: string
  title: string
  pageAge?: string
}

interface SearchResultsProps {
  results: WebSearchResult[]
  isSearching: boolean
}

function SearchResults({ results, isSearching }: SearchResultsProps) {
  if (isSearching) {
    return (
      <div className="search-status">
        <Spin size="small" />
        <span>正在搜索网页...</span>
      </div>
    )
  }

  if (results.length === 0) return null

  return (
    <div className="search-results">
      <div className="search-header">
        <SearchOutlined />
        <span>搜索了 {results.length} 个网页</span>
      </div>
      <div className="search-sources">
        {results.map((result, index) => (
          <a
            key={index}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-item"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}`}
              alt=""
              className="favicon"
            />
            <span className="title">{result.title}</span>
            {result.pageAge && (
              <span className="age">{result.pageAge}</span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
```

#### 引用标注渲染

对于 OpenAI 的 `url_citation` 类型，需要在文本中插入引用标注：

```tsx
function renderTextWithCitations(
  text: string,
  annotations: Array<{ start_index: number; end_index: number; url: string; title: string }>
) {
  // 按 start_index 排序
  const sorted = [...annotations].sort((a, b) => a.start_index - b.start_index)

  const elements: React.ReactNode[] = []
  let lastIndex = 0

  sorted.forEach((annotation, i) => {
    // 添加引用前的文本
    if (annotation.start_index > lastIndex) {
      elements.push(text.slice(lastIndex, annotation.start_index))
    }

    // 添加带引用标注的文本
    elements.push(
      <span key={i} className="cited-text">
        {text.slice(annotation.start_index, annotation.end_index)}
        <sup>
          <a href={annotation.url} target="_blank" title={annotation.title}>
            [{i + 1}]
          </a>
        </sup>
      </span>
    )

    lastIndex = annotation.end_index
  })

  // 添加剩余文本
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex))
  }

  return <>{elements}</>
}
```

### 3.3 样式参考

```css
.search-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  color: #666;
  font-size: 14px;
}

.search-results {
  margin: 12px 0;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #eee;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #888;
  font-size: 12px;
}

.search-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  font-size: 12px;
  color: #333;
  text-decoration: none;
  transition: all 0.2s;
}

.source-item:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.source-item .favicon {
  width: 14px;
  height: 14px;
}

.source-item .title {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-item .age {
  color: #999;
  font-size: 11px;
}

/* 引用标注样式 */
.cited-text {
  background: rgba(24, 144, 255, 0.1);
  border-radius: 2px;
}

.cited-text sup a {
  color: #1890ff;
  text-decoration: none;
  font-size: 10px;
}
```

---

## 4. 各提供商详细实现

### 4.1 Anthropic 完整实现

```typescript
import Anthropic from '@anthropic-ai/sdk'

interface SearchState {
  isSearching: boolean
  results: Array<{
    url: string
    title: string
    pageAge?: string
  }>
}

async function chatWithWebSearch(
  client: Anthropic,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onSearchUpdate: (state: SearchState) => void,
  onTextDelta: (text: string) => void
) {
  const stream = client.messages.stream({
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    messages,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5
      }
    ]
  })

  for await (const event of stream) {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block.type === 'server_tool_use' &&
            event.content_block.name === 'web_search') {
          onSearchUpdate({ isSearching: true, results: [] })
        }
        if (event.content_block.type === 'web_search_tool_result') {
          const results = event.content_block.content
            .filter(item => item.type === 'web_search_result')
            .map(item => ({
              url: item.url,
              title: item.title,
              pageAge: item.page_age
            }))
          onSearchUpdate({ isSearching: false, results })
        }
        break

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          onTextDelta(event.delta.text)
        }
        break
    }
  }
}
```

### 4.2 OpenAI 完整实现

```typescript
import OpenAI from 'openai'

async function chatWithWebSearch(
  client: OpenAI,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onSearchComplete: (citations: Array<{ url: string; title: string }>) => void,
  onTextDelta: (text: string) => void
) {
  // 使用 Response API
  const response = await client.responses.create({
    model: 'gpt-4o',
    input: messages,
    tools: [{ type: 'web_search_preview' }],
    stream: true
  })

  const citations: Array<{ url: string; title: string }> = []

  for await (const event of response) {
    if (event.type === 'response.output_text.delta') {
      onTextDelta(event.delta)
    }

    if (event.type === 'response.output_text.annotation.added') {
      if (event.annotation.type === 'url_citation') {
        citations.push({
          url: event.annotation.url,
          title: event.annotation.title
        })
      }
    }

    if (event.type === 'response.completed') {
      onSearchComplete(citations)
    }
  }
}
```

### 4.3 Gemini 完整实现

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

async function chatWithWebSearch(
  apiKey: string,
  prompt: string,
  onGroundingMetadata: (sources: Array<{ url: string; title: string }>) => void
) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]
  })

  const result = await model.generateContent(prompt)
  const response = result.response

  // 提取 grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata
  if (groundingMetadata?.groundingChunks) {
    const sources = groundingMetadata.groundingChunks
      .filter(chunk => chunk.web)
      .map(chunk => ({
        url: chunk.web!.uri,
        title: chunk.web!.title
      }))
    onGroundingMetadata(sources)
  }

  return response.text()
}
```

---

## 附录：类型定义

```typescript
// 通用模型类型
interface Model {
  id: string
  name: string
  provider: string
  capabilities?: ModelCapability[]
}

interface ModelCapability {
  type: 'text' | 'vision' | 'web_search' | 'function_calling' | 'reasoning' | 'embedding' | 'rerank'
  isUserSelected?: boolean
}

// 搜索结果通用类型
interface WebSearchResult {
  url: string
  title: string
  snippet?: string
  pageAge?: string
}

// 搜索状态
interface WebSearchState {
  isSearching: boolean
  results: WebSearchResult[]
  source: 'anthropic' | 'openai' | 'gemini' | 'perplexity' | 'other'
}

// Chunk 类型（用于流式处理）
enum ChunkType {
  LLM_WEB_SEARCH_IN_PROGRESS = 'llm_web_search_in_progress',
  LLM_WEB_SEARCH_COMPLETE = 'llm_web_search_complete',
  TEXT_DELTA = 'text_delta',
  // ...
}

interface LLMWebSearchInProgressChunk {
  type: ChunkType.LLM_WEB_SEARCH_IN_PROGRESS
}

interface LLMWebSearchCompleteChunk {
  type: ChunkType.LLM_WEB_SEARCH_COMPLETE
  llm_web_search: {
    results: WebSearchResult[]
    source: WebSearchState['source']
  }
}
```

---

## 参考资料

- [Anthropic Web Search Tool](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search)
- [OpenAI Web Search](https://platform.openai.com/docs/guides/tools-web-search)
- [Google Gemini Grounding](https://ai.google.dev/gemini-api/docs/grounding)
- [Perplexity API](https://docs.perplexity.ai/docs/getting-started)

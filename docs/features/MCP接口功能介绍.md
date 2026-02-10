# MCP 接口功能介绍

MJ-Studio 提供 MCP（Model Context Protocol）接口，允许外部 AI 客户端（如 Claude Desktop、Cursor 等）调用本系统的 AI 对话、图片生成和视频生成能力。

## 功能概述

通过 MCP 接口，外部 AI 可以：

- **AI 对话**：使用已配置的助手进行对话，获取 AI 回复
- **图片生成**：调用 Midjourney、DALL-E、Flux、Gemini 等模型生成图片
- **视频生成**：调用即梦、Veo、Sora、Grok Video 等模型生成视频
- **任务查询**：查询生成任务的状态和结果

### 使用场景

- 在 Claude Desktop 中调用 MJ 生成插图
- 让 Cursor 中的 AI 助手生成设计稿配图
- 通过 AI 编程助手批量生成素材
- 集成到其他支持 MCP 的 AI 工具链

## 认证方式

### API Key

用户在「设置 → API 管理」生成专属 API Key，外部客户端通过此 Key 认证身份。

**Key 特性**：
- 每个用户仅有一个 Key
- 重新生成等同于撤销旧 Key
- Key 使用用户自己的上游配额，无额外计费
- 所有通过 MCP 创建的资源（对话、任务）在 Web 端可见

### 配置示例

```json
{
  "mcpServers": {
    "mj-studio": {
      "url": "https://your-domain.com/api/mcp",
      "apiKey": "mjs_xxxxxxxxxxxx"
    }
  }
}
```

## MCP 工具列表

### 查询工具

#### `list_models`

列出用户已配置的模型列表。返回的 `aimodelId` 用于 `generate_image`、`generate_video` 等工具。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `category` | string | 否 | 模型分类：`chat`、`image`、`video`，不传返回全部 |

**返回**：
```json
{
  "models": [
    {
      "aimodelId": 1,
      "name": "GPT-4o",
      "category": "chat",
      "modelType": "gpt",
      "upstreamName": "OpenAI 官方"
    },
    {
      "aimodelId": 5,
      "name": "Midjourney",
      "category": "image",
      "modelType": "midjourney",
      "upstreamName": "MJ Proxy"
    },
    {
      "aimodelId": 8,
      "name": "即梦视频",
      "category": "video",
      "modelType": "jimeng-video",
      "upstreamName": "云雾 API"
    }
  ]
}
```

---

#### `list_assistants`

列出用户可用的助手列表。

**参数**：无

**返回**：
```json
{
  "assistants": [
    {
      "id": 1,
      "name": "默认助手",
      "description": "通用智能助理",
      "model": "gpt-4o",
      "conversationCount": 5
    }
  ]
}
```

---

### 对话工具

#### `list_conversations`

列出助手的对话列表。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `assistantId` | number | 是 | 助手 ID |
| `limit` | number | 否 | 返回数量，默认 20，最大 50 |

**返回**：
```json
{
  "conversations": [
    {
      "id": 123,
      "title": "Vue 响应式原理讨论",
      "messageCount": 12
    }
  ]
}
```

---

#### `get_conversation`

获取对话详情及消息列表。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `conversationId` | number | 是 | 对话 ID |

**返回**：
```json
{
  "id": 123,
  "title": "Vue 响应式原理讨论",
  "assistantId": 1,
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "帮我解释 Vue 的响应式原理",
      "createdAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "Vue 的响应式系统基于...",
      "createdAt": "2024-01-01T00:00:05Z"
    }
  ]
}
```

---

#### `chat`

向指定助手发送消息并获取 AI 回复。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `assistantId` | number | 是 | 助手 ID |
| `message` | string | 是 | 用户消息内容 |
| `conversationId` | number | 否 | 对话 ID，不传则创建新对话 |
| `title` | string | 否 | 对话标题，仅新建对话时有效，不传则自动生成 |
| `stream` | boolean | 否 | 是否流式响应，默认 `false` |

**返回（非流式，stream=false）**：
```json
{
  "conversationId": 123,
  "message": {
    "id": 456,
    "role": "assistant",
    "content": "AI 回复内容..."
  }
}
```

**返回（流式，stream=true）**：
```json
{
  "conversationId": 123,
  "messageId": 456,
  "stream": true,
  "estimatedTime": 2
}
```

流式模式下，`estimatedTime` 为预计首字时间（秒），需调用 `subscribe_message` 工具订阅消息内容。

**说明**：
- 使用助手配置的默认上游和模型
- 对话在 Web 端的「对话列表」中可见

---

#### `subscribe_message`

订阅消息的流式输出。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `messageId` | number | 是 | 消息 ID，从 `chat` 流式响应获取 |

**返回**：流式返回消息内容片段，直到生成完成。

```json
{"delta": "Vue", "done": false}
{"delta": " 的响应式", "done": false}
{"delta": "系统基于...", "done": false}
{"done": true, "content": "Vue 的响应式系统基于..."}
```

---

### 图片生成工具

#### `generate_image`

创建图片生成任务。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `aimodelId` | number | 是 | 模型 ID，从 `list_models` 获取 |
| `prompt` | string | 是 | 图片描述提示词 |
| `images` | string[] | 否 | 参考图 URL 列表 |
| `modelParams` | object | 否 | 模型专用参数，见下方说明 |

**modelParams 参数**（根据模型类型选填）：

| 参数 | 类型 | 适用模型 | 说明 |
|-----|------|---------|------|
| `negativePrompt` | string | MJ、Flux、豆包 | 负面提示词 |
| `size` | string | DALL-E、GPT-Image、豆包 | 尺寸，如 `1024x1024` |
| `aspectRatio` | string | Flux | 宽高比，如 `16:9` |
| `quality` | string | DALL-E、GPT-Image | 质量：`standard`/`hd` 或 `high`/`medium`/`low` |
| `style` | string | DALL-E 3 | 风格：`vivid`/`natural` |
| `seed` | number | 豆包 | 随机种子 |
| `guidanceScale` | number | 豆包 | 提示词相关度 1-10 |
| `botType` | string | MJ | 机器人类型：`MID_JOURNEY`/`NIJI_JOURNEY` |
| `background` | string | GPT-Image | 背景：`auto`/`transparent`/`opaque` |

**返回**：
```json
{
  "taskId": 12345,
  "status": "pending",
  "estimatedTime": 60
}
```

`estimatedTime` 为预计完成时间（秒）。

---

### 视频生成工具

#### `generate_video`

创建视频生成任务。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `aimodelId` | number | 是 | 模型 ID，从 `list_models` 获取 |
| `prompt` | string | 是 | 视频描述提示词 |
| `images` | string[] | 否 | 参考图 URL 列表 |
| `modelParams` | object | 否 | 模型专用参数，见下方说明 |

**modelParams 参数**（根据模型类型选填）：

| 参数 | 类型 | 适用模型 | 说明 |
|-----|------|---------|------|
| `aspectRatio` | string | 即梦、Veo、Grok | 宽高比，如 `16:9`、`9:16` |
| `size` | string | 即梦、Sora、Grok | 分辨率，如 `1080P`、`small`/`large` |
| `duration` | number | Sora | 时长（秒），如 `10`、`15` |
| `enhancePrompt` | boolean | Veo | 提示词增强 |
| `enableUpsample` | boolean | Veo | 超分辨率 |
| `orientation` | string | Sora | 方向：`portrait`/`landscape` |
| `watermark` | boolean | Sora | 是否添加水印 |
| `private` | boolean | Sora | 隐私模式 |

**返回**：
```json
{
  "taskId": 12346,
  "status": "pending",
  "estimatedTime": 180
}
```

`estimatedTime` 为预计完成时间（秒）。

---

### 任务查询工具

#### `get_task`

查询任务状态和结果。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `taskId` | number | 是 | 任务 ID |

**返回**：
```json
{
  "taskId": 12345,
  "taskType": "image",
  "status": "success",
  "prompt": "原始提示词",
  "resourceUrl": "/api/images/xxx.png",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:01:00Z"
}
```

**任务状态**：
- `pending` - 等待提交
- `submitting` - 提交中
- `processing` - 处理中
- `success` - 成功
- `failed` - 失败
- `cancelled` - 已取消

---

#### `list_tasks`

列出用户的任务列表。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `taskType` | string | 否 | 任务类型：`image` 或 `video` |
| `status` | string | 否 | 任务状态筛选 |
| `limit` | number | 否 | 返回数量，默认 10，最大 50 |

**返回**：
```json
{
  "tasks": [
    {
      "taskId": 12345,
      "taskType": "image",
      "status": "success",
      "prompt": "提示词...",
      "resourceUrl": "/api/images/xxx.png",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100
}
```

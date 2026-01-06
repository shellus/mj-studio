# HTTP 日志系统重构方案

## 一、现状分析

### 1. 当前日志系统

**绘图任务日志**（`server/services/logger.ts`）
- 路径：`/logs/YYYY-MM-DD/<taskId>/`
- 文件：`requests.jsonl` 和 `responses.jsonl`
- 功能：记录 HTTP 请求和响应的原始数据

**对话日志**（`server/utils/logger.ts`）
- 形式：**仅控制台输出**，无文件记录
- 功能：输出统计信息、耗时、用量等

### 2. 错误处理检查结果

**流式输出错误时的数据库存储**：
- ✅ **错误信息会存入数据库**（`streamingTask.ts:238-243`）
- 错误发生时调用 `updateMessageContentAndStatus(messageId, errorMessage, 'failed', 'error')`
- `errorMessage` 存储到 `messages.content` 字段
- `status` 设置为 `failed`，`mark` 设置为 `error`

**结论**：对话流式输出出错时，错误信息已正确入库，符合记录HTTP响应日志的需求。

---

## 二、重构目标

### 核心定位
- **文件日志**：仅记录 HTTP 请求/响应的原始数据（用于排查 API 问题）
- **控制台日志**：保持现有的 `server/utils/logger.ts`，输出统计信息、耗时等

### 目录结构
```
/logs/
├── conversation/
│   └── <conversationId>.jsonl    # 对话的所有 HTTP 请求/响应
└── task/
    └── <taskId>.jsonl             # 任务的所有 HTTP 请求/响应
```

**废弃旧结构**：
- ❌ `/logs/YYYY-MM-DD/<taskId>/requests.jsonl`
- ❌ `/logs/YYYY-MM-DD/<taskId>/responses.jsonl`
- ⚠️ **不保留兼容性**，历史日志不迁移

---

## 三、日志格式规范

### 1. 对话日志（`/logs/conversation/<conversationId>.jsonl`）

每次 HTTP 请求/响应记录一条，JSONL 格式（一行一个 JSON）。

#### 请求日志
```jsonl
{
  "timestamp": "2026-01-06T12:00:00.000Z",
  "event": "request",
  "messageId": 123,
  "url": "https://api.openai.com/v1/chat/completions",
  "method": "POST",
  "headers": {
    "Authorization": "Bear****wxyz",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "gpt-4",
    "messages": {
      "_truncated": true,
      "_summary": "[10 messages, 15234 bytes]",
      "_first": [
        {"role": "system", "content": "你是一个专业的AI助手...长的AI助手，擅长写作 (245字节)"},
        {"role": "user", "content": "你好，我想了解一下...下一下人工智能的发展 (189字节)"}
      ],
      "_last": {"role": "user", "content": "帮我写一篇关于人...篇关于人工智能的文章 (156字节)"}
    },
    "stream": true
  }
}
```

**字段说明**：
- `timestamp`: ISO 8601 格式时间戳
- `event`: 固定为 `"request"`
- `messageId`: 关联的消息 ID（用于追踪）
- `url`: 完整请求 URL
- `method`: HTTP 方法（POST/GET等）
- `headers`: 请求头（`Authorization` 脱敏为开头4字符+`****`+结尾4字符）
- `body`: 请求体
  - `messages`: 消息数组（裁剪处理）
    - `_truncated`: 固定为 `true`，标识已裁剪
    - `_summary`: 统计信息（消息数量和总字节数）
    - `_first`: 开头两条消息数组（每条消息的 `content` 裁剪为：开头20字符+`...`+结尾20字符+字节数）
    - `_last`: 最后一条消息（`content` 裁剪为：开头20字符+`...`+结尾20字符+字节数）

#### 响应日志

**流式输出成功**：
```jsonl
{
  "timestamp": "2026-01-06T12:00:03.500Z",
  "event": "response",
  "messageId": 123,
  "status": 200,
  "contentPreview": "你好，我是 AI 助手...很高兴为您服务 (2048字节)",
  "contentLength": 2048,
  "durationMs": 3500
}
```

**流式输出失败**（HTTP错误）：
```jsonl
{
  "timestamp": "2026-01-06T12:00:01.200Z",
  "event": "response",
  "messageId": 123,
  "status": 429,
  "statusText": "Too Many Requests",
  "body": {
    "error": {
      "message": "Rate limit exceeded. Please retry after 60 seconds.",
      "type": "rate_limit_error",
      "code": "rate_limit_exceeded"
    }
  },
  "durationMs": 1200
}
```

**流式输出失败**（网络错误）：
```jsonl
{
  "timestamp": "2026-01-06T12:00:02.500Z",
  "event": "response",
  "messageId": 123,
  "status": null,
  "error": "Failed to fetch",
  "errorType": "NetworkError",
  "durationMs": 2500
}
```

**字段说明**：
- `status`: HTTP 状态码（网络错误时为 `null`）
- `statusText`: HTTP 状态文本（如 `"OK"`, `"Too Many Requests"`）
- `contentPreview`: 成功时的内容预览（开头20字符 + `...` + 结尾20字符 + 长度）
- `contentLength`: 成功时的完整内容字节数
- `body`: 失败时的完整响应体（原始 JSON）
- `error`: 网络错误的错误信息（如 `"Failed to fetch"`）
- `errorType`: 错误类型（如 `"NetworkError"`, `"AbortError"`）
- `durationMs`: 请求耗时（毫秒）

---

### 2. 任务日志（`/logs/task/<taskId>.jsonl`）

合并请求和响应，每次调用追加两条记录。

#### 请求日志
```jsonl
{
  "timestamp": "2026-01-06T12:00:00.000Z",
  "event": "request",
  "url": "https://api.example.com/v1/images/generations",
  "method": "POST",
  "headers": {
    "Authorization": "Bear****wxyz",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "dall-e-3",
    "prompt": "一只可爱的猫咪",
    "image": "[base64 12345 bytes]"
  }
}
```

#### 响应日志

**成功**：
```jsonl
{
  "timestamp": "2026-01-06T12:00:05.000Z",
  "event": "response",
  "status": 200,
  "statusText": "OK",
  "body": {
    "url": "https://example.com/image.png"
  },
  "durationMs": 5000
}
```

**失败**（HTTP 错误）：
```jsonl
{
  "timestamp": "2026-01-06T12:00:02.000Z",
  "event": "response",
  "status": 500,
  "statusText": "Internal Server Error",
  "body": {
    "error": {
      "message": "Model is currently overloaded",
      "type": "server_error"
    }
  },
  "durationMs": 2000
}
```

**失败**（网络错误）：
```jsonl
{
  "timestamp": "2026-01-06T12:00:01.000Z",
  "event": "response",
  "status": null,
  "error": "ECONNREFUSED",
  "errorType": "NetworkError",
  "durationMs": 1000
}
```

**异步轮询任务示例**（如 MJ-Proxy）：
```jsonl
{"timestamp":"...","event":"request","url":".../submit/imagine","method":"POST","headers":{...},"body":{...}}
{"timestamp":"...","event":"response","status":200,"statusText":"OK","body":{"taskId":"xxx","status":"submitted"},"durationMs":500}
{"timestamp":"...","event":"request","url":".../task/xxx/fetch","method":"GET","headers":{...}}
{"timestamp":"...","event":"response","status":200,"statusText":"OK","body":{"status":"processing","progress":"50%"},"durationMs":300}
{"timestamp":"...","event":"request","url":".../task/xxx/fetch","method":"GET","headers":{...}}
{"timestamp":"...","event":"response","status":200,"statusText":"OK","body":{"status":"success","imageUrl":"..."},"durationMs":300}
```

---

## 四、敏感信息处理

### 1. Authorization Header
所有日志中的 `Authorization` header 脱敏显示：开头4字符 + `****` + 结尾4字符

**示例**：
- 原始：`Bearer sk-1234567890abcdefghijklmnopqrstuvwxyz`
- 脱敏：`Bear****wxyz`

### 2. Base64 图片数据
请求体中的 Base64 图片数据截断显示：

**检测规则**：
- 字段值以 `data:image/` 开头（Data URL）
- 字段值是纯 Base64 字符串且长度 > 100

**截断格式**：
```json
{
  "image": "[base64 12345 bytes]",
  "reference_images": ["[base64 8192 bytes]", "[base64 16384 bytes]"]
}
```

### 3. 对话请求中的消息数组
对话请求中的 `messages` 数组包含大量历史消息，替换为裁剪格式：

**裁剪格式**：
```json
{
  "messages": {
    "_truncated": true,
    "_summary": "[10 messages, 15234 bytes]",
    "_first": [
      {"role": "system", "content": "你是一个专业的AI助手...长的AI助手，擅长写作 (245字节)"},
      {"role": "user", "content": "你好，我想了解一下...下一下人工智能的发展 (189字节)"}
    ],
    "_last": {"role": "user", "content": "帮我写一篇关于人...篇关于人工智能的文章 (156字节)"}
  }
}
```

**字段说明**：
- `_truncated`: 固定为 `true`，标识消息数组已被裁剪（避免误以为请求格式错误）
- `_summary`: 统计信息（格式：`[消息数量 messages, 总字节数 bytes]`）
- `_first`: 开头两条消息数组，每条消息的 `content` 裁剪格式：
  - 开头 20 字符 + `...` + 结尾 20 字符 + ` (字节数字节)`
  - 如果 `content` ≤ 40 字符，直接显示完整内容 + 字节数
- `_last`: 最后一条消息，`content` 裁剪规则同上

**注意**：
- 开头两条和最后一条消息不一定是用户消息（可能是手动添加的 AI 消息）
- 如果消息数组只有1条消息，`_first` 只包含1条，`_last` 指向同一条
- 如果消息数组只有2条消息，`_first` 包含这2条，`_last` 指向第2条
- 如果消息数组只有3条消息，`_first` 包含前2条，`_last` 指向第3条

### 4. 响应内容预览
对话响应内容（流式输出）的预览格式：
```
"你好，我是 AI 助手...很高兴为您服务 (2048字节)"
```

**生成规则**：
- 取开头 20 字符 + `...` + 结尾 20 字符
- 追加 ` (${contentLength}字节)`
- 如果内容 ≤ 40 字符，直接显示完整内容 + 长度

---

## 五、实施计划

### 阶段一：新建日志工具

创建 `server/utils/httpLogger.ts`：

```typescript
// 对话日志
export function logConversationRequest(
  conversationId: number,
  messageId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: any }
): void

export function logConversationResponse(
  conversationId: number,
  messageId: number,
  data: {
    status: number | null
    statusText?: string
    content?: string
    body?: any
    error?: string
    errorType?: string
    durationMs: number
  }
): void

// 任务日志
export function logTaskRequest(
  taskId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: any }
): void

export function logTaskResponse(
  taskId: number,
  data: {
    status: number | null
    statusText?: string
    body?: any
    error?: string
    errorType?: string
    durationMs: number
  }
): void
```

**关键实现细节**：
- 使用 `appendFileSync` 追加写入 JSONL 格式
- 自动创建目录（`logs/conversation/` 和 `logs/task/`）
- 敏感信息脱敏（Authorization、Base64 截断、messages 裁剪）
- 异常静默处理（日志失败不影响主流程）

**响应日志记录规则**：
- **成功（status 2xx）**：
  - 对话：记录 `status`、`contentPreview`、`contentLength`
  - 任务：记录 `status`、`statusText`、`body`
- **HTTP 错误（status 4xx/5xx）**：记录 `status`、`statusText`、`body`（完整响应体）
- **网络错误**：记录 `status: null`、`error`、`errorType`

### 阶段二：修改调用点

#### 1. 对话服务（`server/services/chat.ts`）

在 `chatStream` 函数中添加日志：
- **请求前**：记录 `logConversationRequest`
- **流式完成**：记录 `logConversationResponse`（`status: 200`, `content: totalContent`）
- **HTTP 错误**：记录 `logConversationResponse`（`status: 4xx/5xx`, `statusText`, `body: 原始响应体`）
- **网络错误**：记录 `logConversationResponse`（`status: null`, `error`, `errorType`）

**关键点**：
- 需要从外部传入 `conversationId` 和 `messageId`
- HTTP 错误时需要读取完整响应体（`await response.text()` 或 `await response.json()`）
- 响应日志的 `contentPreview` 由日志函数内部根据 `content` 生成

#### 2. 绘图服务（各上游服务）

需修改的文件：
- `server/services/mj.ts`
- `server/services/gemini.ts`
- `server/services/dalle.ts`
- `server/services/openaiChat.ts`
- `server/services/koukoutu.ts`
- `server/services/videoUnified.ts`

**修改内容**：
- 将现有的 `logRequest` 和 `logResponse`（来自 `server/services/logger.ts`）替换为 `logTaskRequest` 和 `logTaskResponse`
- 记录完整的 HTTP 请求/响应数据

### 阶段三：清理旧代码

删除文件：
- ❌ `server/services/logger.ts`（旧的任务日志工具）
- ❌ `server/api/tasks/[id]/logs.get.ts`（日志读取 API）
- ❌ `app/components/studio/ErrorLogsModal.vue`（前端日志展示组件）

保留文件：
- ✅ `server/utils/logger.ts`（控制台日志工具）

移除前端调用：
- 检查 `app/components/studio/` 中是否有其他组件调用了 `ErrorLogsModal`，一并移除

---

**文档版本**：v2.0
**创建时间**：2026-01-06
**负责人**：编程之王v4

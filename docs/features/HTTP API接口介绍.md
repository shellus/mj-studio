# HTTP API 接口介绍

MJ-Studio 提供 HTTP API 接口，允许通过标准 HTTP 请求调用本系统的 AI 对话能力，适用于脚本、自动化工具、第三方集成等场景。

## 功能概述

通过 HTTP API，外部程序可以：

- **AI 对话**：向指定助手发送消息并获取 AI 回复
- **多轮对话**：通过 `conversationId` 维持上下文连续性
- **模型覆盖**：通过 `aimodelId` 临时使用非默认模型
- **流式/非流式**：支持等待完整响应或异步流式生成
- **图片/视频生成**：通过模型 ID 调用图片和视频生成能力
- **任务管理**：查询生成任务的状态和结果
- **文件上传**：上传参考图片等资源文件

### 使用场景

- 命令行脚本中调用 AI 助手
- 自动化工作流集成（如 CI/CD、定时任务）
- 第三方应用对接 AI 对话能力
- 批量文本处理和生成
- AI Agent（如 Claude Code）通过 CLI 工具调用

## 认证方式

HTTP API 与 MCP 接口共用同一个 API Key，通过 `Authorization` 请求头传递 Bearer Token。

```bash
Authorization: Bearer mjs_xxxxxxxxxxxx
```

API Key 在「设置 → API 管理」页面生成。

**Key 特性**：
- 每个用户仅有一个 Key，MCP 和 HTTP API 共用
- 重新生成等同于撤销旧 Key
- Key 使用用户自己的上游配额，无额外计费
- 所有通过 API 创建的对话在 Web 端可见

## 接口列表

### POST /api/external/chat

向指定助手发送消息并获取 AI 回复。

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `assistantId` | number | 是 | 助手 ID，从 Web 端或 MCP `list_assistants` 获取 |
| `message` | string | 是 | 用户消息内容 |
| `conversationId` | number | 否 | 对话 ID，不传则创建新对话 |
| `title` | string | 否 | 对话标题，仅新建对话时有效，不传则自动生成 |
| `stream` | boolean | 否 | 是否流式响应，默认 `false` |
| `aimodelId` | number | 否 | 一次性模型 ID，本次请求使用该模型，不影响助手默认配置 |
| `persistent` | boolean | 否 | 是否永久保留对话，默认 `false`（临时对话 1 小时后自动清理） |

**返回（非流式，stream=false）**：

```json
{
  "status": "ok",
  "data": {
    "conversationId": 123,
    "message": {
      "id": 456,
      "role": "assistant",
      "content": "AI 回复内容..."
    }
  }
}
```

**返回（流式，stream=true）**：

```json
{
  "status": "ok",
  "data": {
    "conversationId": 123,
    "messageId": 456,
    "stream": true,
    "estimatedTime": 2
  }
}
```

流式模式下，接口立即返回 `messageId`，AI 在后台异步生成。`estimatedTime` 为预计首字时间（秒）。生成的内容可在 Web 端对应对话中查看。

**说明**：
- 使用助手配置的系统提示词和默认模型（除非指定 `aimodelId`）
- 对话在 Web 端的「对话列表」中可见，支持多端同步
- 非流式模式会等待 AI 完整回复后返回，适合脚本场景

### GET /api/external/models

列出当前用户可用的 AI 模型。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `category` | string | 否 | 模型分类过滤：`image`、`video`、`chat` |

**返回**：

```json
{
  "status": "ok",
  "data": {
    "models": [
      {
        "aimodelId": 5,
        "name": "DALL-E 3",
        "category": "image",
        "modelType": "dalle",
        "upstreamName": "OpenAI"
      }
    ]
  }
}
```

### GET /api/external/assistants

列出当前用户的所有助手。

**返回**：

```json
{
  "status": "ok",
  "data": {
    "assistants": [
      {
        "id": 1,
        "name": "默认助手",
        "description": "通用对话助手",
        "model": "GPT-4o",
        "conversationCount": 12
      }
    ]
  }
}
```

### POST /api/external/image

生成图片。

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `aimodelId` | number | 是 | 图片模型 ID |
| `prompt` | string | 是 | 图片描述 |
| `images` | string[] | 否 | 参考图 URL 列表（图生图场景） |
| `modelParams` | object | 否 | 模型特定参数（如 `negativePrompt`、`size`、`aspectRatio`） |
| `blocking` | boolean | 否 | 是否阻塞等待结果，默认 `true` |

**返回（阻塞模式，blocking=true）**：

```json
{
  "status": "ok",
  "data": {
    "taskId": 789,
    "status": "success",
    "resourceUrl": "https://your-domain.com/api/files/xxx.png"
  }
}
```

**返回（非阻塞模式，blocking=false）**：

```json
{
  "status": "ok",
  "data": {
    "taskId": 789,
    "status": "pending",
    "estimatedTime": 30,
    "message": "Task created. ..."
  }
}
```

### POST /api/external/video

生成视频。参数与 `image` 接口一致，`aimodelId` 须为视频模型。

阻塞模式超时时间为 10 分钟（图片为 3 分钟）。

### GET /api/external/tasks

列出生成任务。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `type` | string | 否 | 任务类型：`image`、`video` |
| `status` | string | 否 | 任务状态：`pending`、`submitting`、`processing`、`success`、`failed`、`cancelled` |
| `limit` | number | 否 | 返回数量，默认 10，最大 50 |

**返回**：

```json
{
  "status": "ok",
  "data": {
    "tasks": [
      {
        "taskId": 789,
        "taskType": "image",
        "status": "success",
        "prompt": "一只猫",
        "resourceUrl": "https://your-domain.com/api/files/xxx.png",
        "createdAt": "2026-03-09T10:00:00.000Z"
      }
    ],
    "total": 42
  }
}
```

### GET /api/external/tasks/:id

查看单个任务详情。

**返回**：

```json
{
  "status": "ok",
  "data": {
    "taskId": 789,
    "taskType": "image",
    "status": "success",
    "prompt": "一只猫",
    "resourceUrl": "https://your-domain.com/api/files/xxx.png",
    "error": null,
    "progress": 100,
    "createdAt": "2026-03-09T10:00:00.000Z",
    "updatedAt": "2026-03-09T10:00:30.000Z"
  }
}
```

### POST /api/external/upload

上传文件（如参考图片）。使用 `multipart/form-data` 格式。

**请求**：

```bash
curl -X POST https://your-domain.com/api/external/upload \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -F "file=@./photo.jpg"
```

**返回**：

```json
{
  "status": "ok",
  "data": {
    "url": "https://your-domain.com/api/files/xxx.jpg"
  }
}
```

上传后获得的 URL 可作为 `image`/`video` 接口的 `images` 参数。

---

## curl 示例

### 基本对话（新建对话）

```bash
curl -X POST https://your-domain.com/api/external/chat \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
  "assistantId": 1,
  "message": "你好"
}'
```

### 多轮对话（继续已有对话）

```bash
curl -X POST https://your-domain.com/api/external/chat \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
  "assistantId": 1,
  "conversationId": 123,
  "message": "请继续解释"
}'
```

### 指定模型

```bash
curl -X POST https://your-domain.com/api/external/chat \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
  "assistantId": 1,
  "message": "用 Claude 回答这个问题",
  "aimodelId": 5
}'
```

### 列出模型

```bash
curl -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  "https://your-domain.com/api/external/models?category=image"
```

### 生成图片

```bash
curl -X POST https://your-domain.com/api/external/image \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
  "aimodelId": 5,
  "prompt": "一只穿着宇航服的猫",
  "blocking": true
}'
```

### 上传文件并图生图

```bash
# 1. 上传参考图
URL=$(curl -s -X POST https://your-domain.com/api/external/upload \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -F "file=@./photo.jpg" | jq -r '.data.url')

# 2. 用参考图生成
curl -X POST https://your-domain.com/api/external/image \
  -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d "{
  \"aimodelId\": 5,
  \"prompt\": \"转换为水彩画风格\",
  \"images\": [\"$URL\"]
}"
```

### 查询任务

```bash
# 列出最近 5 个成功的图片任务
curl -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  "https://your-domain.com/api/external/tasks?type=image&status=success&limit=5"

# 查看单个任务
curl -H "Authorization: Bearer mjs_xxxxxxxxxxxx" \
  "https://your-domain.com/api/external/tasks/789"
```

---

## 响应格式

所有响应都使用统一的格式：

**成功响应**：
- HTTP 状态码：200
- Body：`{ "status": "ok", "data": {...} }`

**错误响应**：
- HTTP 状态码：400/401/404/502
- Body：`{ "status": "error", "error": "错误描述" }`

## 错误码说明

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 参数错误（缺少必填参数、助手未配置模型等） |
| 401 | 认证失败（缺少 API Key、Key 无效或格式错误） |
| 404 | 资源不存在（助手、对话或任务不属于当前用户） |
| 500 | 服务端内部错误（文件保存失败等） |
| 502 | 上游服务错误（AI 模型调用失败） |

**错误响应示例**：

```json
{
  "status": "error",
  "error": "请指定助手 ID"
}
```

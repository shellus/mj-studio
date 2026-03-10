# CLI 工具介绍

MJ-Studio 提供命令行工具 `mjcli`，允许通过终端调用本系统的全部能力——对话、图片生成、视频生成、任务管理。主要面向 AI Agent（Claude Code、Cursor 等）集成，同时兼顾人类在终端中的直接使用。

## 功能概述

通过 CLI 工具，外部程序可以：

- **AI 对话**：向指定助手发送消息并获取 AI 回复
- **图片生成**：调用已配置的模型生成图片，支持参考图上传
- **视频生成**：调用已配置的模型生成视频，支持图生视频
- **任务管理**：查询生成任务的状态和结果
- **模型查询**：列出用户已配置的模型和助手

### 使用场景

- AI Agent 在编程过程中调用绘图/对话能力（如 Claude Code 通过 Bash 工具调用）
- 终端中快速生成一张图片或发起一次对话
- Shell 脚本中批量生成素材
- CI/CD 流程中自动化调用 AI 能力

### 与 MCP 接口的区别

| 维度 | CLI 工具 | MCP 接口 |
|------|---------|---------|
| 调用方式 | Shell 命令 | MCP 协议 |
| 适用客户端 | 任意终端/Agent | 支持 MCP 的客户端（Claude Desktop、Cursor） |
| 输出格式 | 文本/JSON 自适应 | MCP 协议格式 |
| 安装方式 | `npm install -g` | 配置 mcpServers |
| 文件上传 | 直接传本地路径 | 需先获取上传 URL |

> [!tip] 如何选择
> 如果你的 AI 客户端支持 MCP（如 Claude Desktop），优先使用 MCP 接口，体验更好。CLI 工具适合不支持 MCP 的场景，或需要在 Shell 脚本中集成的场景。

## 安装

```bash
npm install -g @shellus/mjcli
```

安装后可用 `mjcli` 命令。

## 配置

通过环境变量配置服务端地址和 API Key：

```bash
export MJCLI_URL=https://your-domain.com
export MJCLI_KEY=mjs_xxxxxxxxxxxx
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `MJCLI_URL` | 是 | MJ-Studio 服务端地址（不含尾部 `/`） |
| `MJCLI_KEY` | 是 | API Key，在「设置 → API 管理」页面生成 |

API Key 与 MCP 接口、HTTP API 共用同一个，格式为 `mjs_` 前缀。

> [!warning] 安全提示
> 不要将 API Key 硬编码在脚本中。建议通过 `.env` 文件或密钥管理工具注入环境变量。

## 输出格式

CLI 根据运行环境自动选择输出格式：

| 环境 | 输出格式 | 说明 |
|------|---------|------|
| TTY（终端直接使用） | 人类可读文本 | 彩色表格、友好提示 |
| 非 TTY（管道/Agent 调用） | JSON | 结构化数据，方便解析 |

可通过参数强制指定：

- `--json`：强制 JSON 输出
- `--pretty`：强制人类可读输出

---

## 命令列表

### `mjcli model ls` — 列出模型

列出用户已配置的模型列表。

**参数**：

| 参数 | 缩写 | 类型 | 说明 |
|------|------|------|------|
| `--type` | `-t` | string | 按类型筛选：`chat`、`image`、`video` |

**示例**：

```bash
# 列出所有模型
mjcli model ls

# 仅列出图片生成模型
mjcli model ls -t image
```

**输出（JSON）**：

```json
{
  "models": [
    {
      "aimodelId": 5,
      "name": "Midjourney",
      "category": "image",
      "modelType": "midjourney",
      "upstreamName": "MJ Proxy"
    }
  ]
}
```

---

### `mjcli assistant ls` — 列出助手

列出用户可用的助手列表。

**参数**：无

**示例**：

```bash
mjcli assistant ls
```

**输出（JSON）**：

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

### `mjcli chat` — AI 对话

向指定助手发送消息并获取 AI 回复。

**参数**：

| 参数 | 缩写 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `<message>` | | string | 是 | 消息内容（位置参数） |
| `--assistant` | `-a` | number | 是 | 助手 ID |
| `--conversation` | `-c` | number | 否 | 对话 ID，不传则创建新对话 |
| `--model` | `-m` | number | 否 | 一次性模型 ID，本次使用该模型 |
| `--title` | | string | 否 | 对话标题，仅新建对话时有效 |
| `--persistent` | | boolean | 否 | 永久保留对话，默认 `false`（临时对话 1 小时后清理） |

**示例**：

```bash
# 新对话
mjcli chat -a 1 "你好"

# 继续已有对话
mjcli chat -a 1 -c 123 "请继续解释"

# 指定模型
mjcli chat -a 1 -m 5 "用 Claude 回答这个问题"

# 永久保留对话
mjcli chat -a 1 --persistent "帮我写一个函数"
```

**输出（JSON）**：

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

> [!note]
> 对话始终以阻塞模式运行，等待 AI 完整回复后返回。对话在 Web 端同样可见。

---

### `mjcli image` — 图片生成

创建图片生成任务。

**参数**：

| 参数 | 缩写 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `<prompt>` | | string | 是 | 图片描述提示词（位置参数） |
| `--model` | `-m` | number | 是 | 模型 ID，从 `model ls` 获取 |
| `--ref` | `-r` | string | 否 | 参考图本地路径，可多次指定 |
| `--async` | | boolean | 否 | 异步模式，立即返回 taskId |
| `--negative-prompt` | | string | 否 | 负面提示词 |
| `--size` | | string | 否 | 尺寸，如 `1024x1024` |
| `--aspect-ratio` | | string | 否 | 宽高比，如 `16:9` |
| `--quality` | | string | 否 | 质量：`standard`/`hd` 等 |
| `--style` | | string | 否 | 风格：`vivid`/`natural` |

> [!info] 模型参数
> `--size`、`--aspect-ratio`、`--quality` 等参数并非对所有模型生效，具体支持情况参见 [MCP 接口功能介绍](./MCP接口功能介绍.md) 中的 modelParams 说明。

**示例**：

```bash
# 基本生图（阻塞等待结果）
mjcli image -m 5 "一只可爱的猫咪"

# 带参考图（自动上传本地文件）
mjcli image -m 5 "风格迁移" --ref ./photo.jpg

# 多张参考图
mjcli image -m 5 "融合风格" -r ./a.jpg -r ./b.jpg

# 异步模式
mjcli image -m 5 "猫咪" --async

# 带模型参数
mjcli image -m 5 "猫咪" --size 1024x1024 --quality hd
```

**输出（阻塞模式，默认）**：

```json
{
  "taskId": 12345,
  "status": "success",
  "resourceUrl": "https://your-domain.com/api/images/xxx.png"
}
```

**输出（异步模式，`--async`）**：

```json
{
  "taskId": 12345,
  "status": "pending",
  "estimatedTime": 60
}
```

> [!note] 参考图上传
> `--ref` 接受本地文件路径，CLI 会自动上传文件并将返回的 URL 传给服务端，无需手动调用上传接口。

---

### `mjcli video` — 视频生成

创建视频生成任务。

**参数**：

| 参数 | 缩写 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `<prompt>` | | string | 是 | 视频描述提示词（位置参数） |
| `--model` | `-m` | number | 是 | 模型 ID |
| `--ref` | `-r` | string | 否 | 参考图本地路径，可多次指定 |
| `--async` | | boolean | 否 | 异步模式 |
| `--aspect-ratio` | | string | 否 | 宽高比，如 `16:9` |
| `--duration` | | number | 否 | 时长（秒） |

**示例**：

```bash
# 文生视频（阻塞等待）
mjcli video -m 8 "日落延时摄影"

# 图生视频
mjcli video -m 8 "让图片动起来" --ref ./image.png

# 指定参数
mjcli video -m 8 "日落" --aspect-ratio 16:9 --duration 10

# 异步模式
mjcli video -m 8 "日落" --async
```

**输出格式与 `mjcli image` 一致。**

---

### `mjcli task ls` — 列出任务

列出用户的生成任务列表。

**参数**：

| 参数 | 缩写 | 类型 | 说明 |
|------|------|------|------|
| `--type` | `-t` | string | 任务类型：`image` 或 `video` |
| `--status` | `-s` | string | 状态筛选：`pending`/`processing`/`success`/`failed` |
| `--limit` | `-l` | number | 返回数量，默认 10，最大 50 |

**示例**：

```bash
# 列出所有任务
mjcli task ls

# 筛选进行中的图片任务
mjcli task ls -t image -s processing
```

---

### `mjcli task get <taskId>` — 查看任务详情

查询指定任务的状态和结果。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `<taskId>` | number | 是 | 任务 ID（位置参数） |

**示例**：

```bash
mjcli task get 12345
```

**输出（JSON）**：

```json
{
  "taskId": 12345,
  "taskType": "image",
  "status": "success",
  "prompt": "一只可爱的猫咪",
  "resourceUrl": "https://your-domain.com/api/images/xxx.png",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:01:00Z"
}
```

---

### `mjcli upload <file>` — 上传文件

上传本地文件到服务端，返回可用的 URL。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `<file>` | string | 是 | 本地文件路径（位置参数） |

**示例**：

```bash
mjcli upload ./photo.jpg
```

**输出（JSON）**：

```json
{
  "url": "https://your-domain.com/api/images/abc123.jpg"
}
```

> [!tip]
> 通常不需要单独调用 `upload`，`image` 和 `video` 命令的 `--ref` 参数会自动上传本地文件。此命令适合需要预先上传文件的场景。

---

## 退出码

| 退出码 | 说明 |
|-------|------|
| `0` | 成功 |
| `1` | 一般错误（参数错误、网络错误等） |
| `2` | 认证失败（API Key 无效或未配置） |
| `3` | 任务失败（生成任务被上游拒绝） |
| `4` | 任务超时（阻塞等待超时） |

---

## AI Agent 集成示例

### Claude Code

在 Claude Code 中通过 Bash 工具调用：

```bash
# 生成图片
mjcli image -m 5 "项目架构图，扁平化风格" --json

# 对话
mjcli chat -a 1 "帮我把这段代码翻译成 Python" --json

# 查看可用模型
mjcli model ls -t image --json
```

Agent 调用时通常在非 TTY 环境下运行，输出会自动切换为 JSON 格式，无需手动添加 `--json`。

### Shell 脚本

```bash
#!/bin/bash
export MJCLI_URL=https://your-domain.com
export MJCLI_KEY=mjs_xxxxxxxxxxxx

# 生成图片并获取 URL
result=$(mjcli image -m 5 "产品封面图")
url=$(echo "$result" | jq -r '.resourceUrl')
echo "图片地址: $url"
```

---

## 技术信息

- **npm 包名**：`@shellus/mjcli`
- **命令名**：`mjcli`
- **运行环境**：Node.js 18+
- **底层通信**：调用 MJ-Studio 的 HTTP API（`/api/external/*` 接口）

详细的 API 格式说明参见 [HTTP API 接口介绍](./HTTP%20API接口介绍.md)。

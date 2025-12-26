# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MJ-Studio 是一个多模型 AI 工作台，支持 AI 绘图（Midjourney、DALL-E、Gemini、Flux 等）和 AI 对话（GPT、Claude、DeepSeek 等）。基于 Nuxt 4 + Drizzle ORM + SQLite 构建。

## 常用命令

```bash
# 开发
pnpm dev                    # 启动开发服务器
pnpm build                  # 构建生产版本

# 数据库
pnpm db:generate            # 生成数据库迁移
pnpm db:migrate             # 执行数据库迁移

# 测试
pnpm test                   # 运行所有测试
pnpm test:watch             # 监听模式运行测试
vitest run tests/xxx.test.ts  # 运行单个测试文件
```

## 目录结构

```
app/                          # 前端代码
├── pages/                    # 页面（drawing.vue、chat.vue、settings/）
├── components/               # UI 组件
│   ├── chat/                 # 对话相关组件
│   ├── drawing/              # 绘图相关组件
│   └── settings/             # 设置相关组件
├── composables/              # 组合式函数
└── shared/                   # 前后端共享类型和常量
server/                       # 后端代码
├── api/                      # API 路由
├── services/                 # 业务逻辑
└── database/                 # 数据库 schema 和迁移
data/                         # SQLite 数据库、上传的图片
logs/                         # API 请求/响应日志
docs/                         # 详细设计文档
```

## 组件清单

### 全局组件
| 组件 | 用途 |
|-----|-----|
| `AppHeader.vue` | 顶部导航栏（Logo、导航链接、用户菜单、主题切换） |
| `TimeAgo.vue` | 相对时间显示 |
| `ModelSelector.vue` | 通用模型选择器（下拉列表、分类筛选） |

### 对话组件 (`chat/`)
| 组件 | 用途 |
|-----|-----|
| `MessageList.vue` | 消息列表（Markdown 渲染、代码高亮、图片附件） |
| `MessageInput.vue` | 输入框（文件上传、多模态、模型选择、流式控制） |
| `ConversationList.vue` | 对话列表（新建、删除、重命名、AI 生成标题） |
| `AssistantList.vue` | 助手列表（新建、选择、编辑） |
| `AssistantEditor.vue` | 助手编辑弹窗（名称、描述、头像、System Prompt） |
| `AssistantInfo.vue` | 助手信息展示（右侧栏元数据） |
| `MarkdownContent.vue` | Markdown 渲染（处理 mj-drawing 代码块） |
| `MjDrawingBlock.vue` | 嵌入式绘图组件（对话中渲染绘图参数） |

### 绘图组件 (`drawing/`)
| 组件 | 用途 |
|-----|-----|
| `Workbench.vue` | 绘图工作台（提示词、负面提示词、参考图、模型选择） |
| `List.vue` | 任务列表（分页、筛选、搜索、批量操作） |
| `Card.vue` | 任务卡片（结果展示、操作按钮、进度条） |
| `Loader.vue` | 加载动画 |
| `Trash.vue` | 回收站（恢复/永久删除） |

### 设置组件 (`settings/`)
| 组件 | 用途 |
|-----|-----|
| `Layout.vue` | 设置页面布局（侧边栏 + 内容区，移动端适配） |
| `Sidebar.vue` | 设置侧边栏导航 |

## Composables 清单

| Composable | 用途 |
|-----------|-----|
| `useAuth` | JWT 认证（login/logout/token/getAuthHeader） |
| `useUserSettings` | 用户设置持久化 |
| `useTasks` | 绘图任务管理（轮询、状态更新、按钮动作） |
| `useTrash` | 回收站管理 |
| `useConversations` | 对话流式输出（SSE 订阅、打字机效果、消息状态机） |
| `useAssistants` | 助手 CRUD |
| `useUpstreams` | 上游配置管理（包含 aimodels 子表） |
| `useChatModels` | 对话模型筛选（从 useUpstreams 获取数据） |
| `useMarkdown` | Markdown 渲染 + Shiki 代码高亮 |
| `useConversationSuggestions` | 对话开场白建议 |
| `useTimeFormat` | 时间格式化（formatTimeAgo/formatDate/formatDateTime） |
| `useMediaQuery` | 响应式媒体查询（useIsMobile/useIsTablet/useIsDesktop） |

## 架构概览

### 前后端共享类型系统

类型和常量定义在 `app/shared/` 目录，前后端共用：
- `types.ts`: 核心类型定义（ModelType、ApiFormat、TaskStatus、MessageRole 等）
- `constants.ts`: 常量和映射表（MODEL_TYPE_LABELS、API_FORMAT_LABELS 等）

数据库 schema (`server/database/schema.ts`) 从 shared 导入类型，确保类型一致性。

### 服务层架构

`server/services/` 包含核心业务逻辑：
- `task.ts`: 绘图任务管理，根据 apiFormat 路由到不同服务
- `chat.ts`: 对话服务，支持流式响应和多模态（图片附件）
- `conversation.ts`: 对话会话管理
- `mj.ts`, `gemini.ts`, `dalle.ts`, `openaiChat.ts`, `koukoutu.ts`: 各上游 API 的封装

### API 格式路由

绘图任务根据 `apiFormat` 字段选择处理方式：
- `mj-proxy`: 异步轮询模式（Midjourney）
- `gemini`, `dalle`, `openai-chat`: 同步请求模式
- `koukoutu`: 异步轮询模式（抠抠图）

## API 格式详解

| 请求格式 | 文生图接口 | 垫图接口 | 参考图格式 | 返回图片 |
|---------|-----------|---------|-----------|---------|
| MJ-Proxy | `POST /mj/submit/imagine` | 同左 | Base64 数组 | URL |
| Gemini | `POST /v1beta/models/{model}:generateContent` | 同左 | Base64 (inlineData) | Base64 |
| DALL-E | `POST /v1/images/generations` | 同左 | 纯 Base64 | URL / Base64 |
| DALL-E (豆包) | `POST /v1/images/generations` | 同左 | Data URL (`data:image/...;base64,...`) | URL |
| DALL-E (Flux) | `POST /v1/images/edits` | 同左 | multipart/form-data 文件上传 | Base64 |
| OpenAI Chat | `POST /v1/chat/completions` | 同左 | Base64 Data URL | URL (从 Markdown 解析) |
| 抠抠图 | - | `POST /v1/create` | multipart/form-data 文件上传 | URL（异步轮询） |

### MJ-Proxy 格式

兼容 [midjourney-proxy](https://github.com/novicezk/midjourney-proxy) API：
- `POST /mj/submit/imagine` - 文生图/垫图，参考图通过 `base64Array` 字段上传
- `POST /mj/submit/blend` - 图片混合
- `POST /mj/submit/action` - 按钮操作 (U/V/🔄)
- `GET /mj/task/{id}/fetch` - 轮询任务状态，返回 `imageUrl`

### Gemini 格式

使用 Google Generative Language API：
- `POST /v1beta/models/{model}:generateContent` - 文生图/垫图
- 参考图通过 `inlineData` 字段上传 (Base64)
- 返回图片为 Base64 (`candidates[].content.parts[].inlineData.data`)

### DALL-E 格式

兼容 OpenAI Images API，但不同模型有特殊处理：

**标准 DALL-E**：
- `POST /v1/images/generations` - 文生图/垫图
- 垫图时参考图通过 `image` 字段传递（纯 Base64）
- 返回 `data[].url` 或 `data[].b64_json`

**豆包模型**（模型名含 `doubao`）：
- 同上端点，但 `image` 字段需要完整 Data URL 格式：`data:image/png;base64,...`
- 不发送 `size` 参数（部分上游不支持 `adaptive`）

**Flux 模型**（模型名含 `flux`）：
- `POST /v1/images/edits` - 使用编辑端点
- `multipart/form-data` 格式，图片作为文件上传
- 返回 `data[].b64_json`

### OpenAI Chat 格式

兼容 OpenAI Chat Completions API（支持图像生成的模型）：
- `POST /v1/chat/completions` - 文生图/垫图
- 垫图时参考图通过 `content[].image_url.url` 字段上传 (支持 Base64 Data URL)
- 返回图片 URL 从 `choices[].message.content` 中解析 (Markdown格式)

### 抠抠图格式

智能抠图服务，异步轮询模式（类似 MJ-Proxy）：
- `POST /v1/create` - 创建抠图任务，必须上传图片
- `POST /v1/query` - 轮询任务状态
- 参数：`model_key`（默认 `background-removal`）、`output_format`（webp/png）
- 返回：`state` 0=处理中、1=成功、-1=失败，成功时 `result_file` 为图片 URL

## 图片处理规范

### 核心原则

1. **前端提交**：使用本地 URL（`/api/images/xxx`），不直接提交 Base64
2. **数据库存储**：存储本地 URL，不存储 Base64
3. **上游请求**：后端按需将本地 URL 转换为 Base64 发送给上游 API
4. **结果本地化**：上游返回的图片（URL 或 Base64）必须下载/保存到本地，返回本地 URL

### 图片上传流程

```
前端选择图片
    ↓
POST /api/images/upload (multipart/form-data)
    ↓
后端保存到 data/images/，返回本地 URL
    ↓
前端使用本地 URL 提交任务
    ↓
后端读取本地文件，按需转换为 Base64 调用上游
    ↓
上游返回结果图片
    ↓
后端本地化（下载/保存），返回本地 URL
```

### 各上游 API 的图片格式要求

| 上游服务 | 参考图格式 | 返回图片格式 |
|---------|-----------|-------------|
| MJ-Proxy | 纯 Base64 数组 | HTTP URL |
| Gemini | Data URL (`data:image/...;base64,...`) | Base64 |
| DALL-E | 纯 Base64 / Data URL / FormData（按模型） | URL 或 Base64 |
| OpenAI Chat | Data URL | URL（从 Markdown 解析） |
| 抠抠图 | FormData 文件上传 | HTTP URL |

### 关键函数

- `server/services/file.ts`:
  - `saveUploadedFile()` - 保存上传的文件
  - `downloadFile()` - 下载远程图片到本地
  - `saveBase64Image()` - 保存 Base64 图片到本地
  - `readFileAsBase64()` - 读取本地文件为 Base64
  - `getFileUrl()` - 生成本地访问 URL

## 任务生命周期

```
pending → submitting → processing → success
                   ↘           ↘
                    failed ←────┘
                       ↓
                   (软删除)
                       ↓
                    回收站 → 恢复 / 永久删除
```

## 流式输出系统

对话模块采用后端独立状态机模式实现流式输出。

### 架构概览

```
前端                          后端
  │                            │
  ├─ POST /messages ──────────►│ 创建消息，返回 messageId
  │                            │
  ├─ GET /messages/:id/stream ►│ SSE 订阅
  │◄─────── data: {content} ───│ 流式推送内容
  │◄─────── data: {done} ──────│ 完成信号
  │                            │
  ├─ POST /messages/:id/stop ─►│ 中止生成
```

### 消息状态流转

```
created → pending → streaming → completed
                            ↘ stopped
                            ↘ failed
```

### 关键文件

- `server/services/streamingTask.ts` - 流式任务管理
- `server/services/streamingCache.ts` - 内容缓存（支持断线重连）
- `app/composables/useConversations.ts` - 前端 SSE 订阅和打字机效果

## API 接口清单

### 认证
| 方法 | 端点 | 功能 |
|-----|------|-----|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 用户注册 |

### 用户
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/user` | 获取当前用户信息 |
| PUT | `/api/user` | 更新用户信息 |

### 助手
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/assistants` | 获取助手列表 |
| POST | `/api/assistants` | 创建助手 |
| GET | `/api/assistants/[id]` | 获取助手详情 |
| PUT | `/api/assistants/[id]` | 更新助手 |
| DELETE | `/api/assistants/[id]` | 删除助手 |
| POST | `/api/assistants/[id]/suggestions` | 获取开场白建议 |

### 上游配置
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/upstreams` | 获取上游配置列表（包含 aimodels） |
| POST | `/api/upstreams` | 创建上游配置 |
| PUT | `/api/upstreams/[id]` | 更新上游配置 |
| DELETE | `/api/upstreams/[id]` | 删除上游配置 |
| GET | `/api/upstreams/[id]/balance` | 查询上游配置的余额 |

### 对话
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/conversations` | 获取对话列表（按 assistantId 筛选） |
| POST | `/api/conversations` | 创建新对话 |
| GET | `/api/conversations/[id]` | 获取对话详情及消息 |
| PUT | `/api/conversations/[id]` | 更新对话标题 |
| DELETE | `/api/conversations/[id]` | 删除对话 |
| POST | `/api/conversations/[id]/messages` | 发送消息（触发 AI 回复） |
| POST | `/api/conversations/[id]/messages-manual` | 手动添加消息 |
| POST | `/api/conversations/[id]/generate-title` | AI 生成对话标题 |
| POST | `/api/conversations/[id]/compress` | 压缩对话历史 |

### 消息
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/messages/[id]/stream` | SSE 流式订阅 |
| POST | `/api/messages/[id]/stop` | 停止消息生成 |
| PATCH | `/api/messages/[id]` | 编辑消息内容 |
| DELETE | `/api/messages/[id]` | 删除消息 |
| POST | `/api/messages/[id]/replay` | 重放消息 |
| POST | `/api/messages/[id]/fork` | 分叉对话 |
| POST | `/api/messages/[id]/delete-until` | 删除指定消息及之前的消息 |

### 绘图任务
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/tasks` | 获取任务列表（分页、筛选） |
| POST | `/api/tasks` | 创建任务 |
| GET | `/api/tasks/[id]` | 获取任务详情 |
| GET | `/api/tasks/[id]/logs` | 获取任务日志 |
| DELETE | `/api/tasks/[id]` | 删除任务（软删除） |
| POST | `/api/tasks/[id]/retry` | 重试失败任务 |
| POST | `/api/tasks/[id]/cancel` | 取消进行中任务 |
| PATCH | `/api/tasks/[id]/blur` | 切换图片模糊状态 |
| PATCH | `/api/tasks/blur-batch` | 批量切换模糊状态 |
| POST | `/api/tasks/action` | 执行按钮动作（U/V/🔄） |
| GET | `/api/tasks/trash` | 获取回收站列表 |
| POST | `/api/tasks/[id]/restore` | 恢复任务 |
| DELETE | `/api/tasks/trash/empty` | 清空回收站 |

### 文件
| 方法 | 端点 | 功能 |
|-----|------|-----|
| POST | `/api/files/upload` | 上传文件（对话附件） |
| GET | `/api/files/[name]` | 下载文件 |
| POST | `/api/images/upload` | 上传图片（绘图参考图） |
| GET | `/api/images/[name]` | 获取图片 |

### 设置
| 方法 | 端点 | 功能 |
|-----|------|-----|
| GET | `/api/settings` | 获取用户设置 |
| PUT | `/api/settings` | 更新用户设置 |

## 日志系统

所有 API 请求和响应会记录到 `logs/` 目录，便于排查问题：

```
logs/
└── 2025-12-16/           # 按日期分组
    └── 57/               # 按任务ID分组
        ├── request.json  # 请求数据（URL、headers、body）
        └── response.json # 响应数据（状态码、响应体、错误）
```

日志中敏感信息会自动处理：
- `Authorization` header 显示为 `[REDACTED]`
- Base64 图片数据显示为 `[base64 N chars]` 或 `[dataUrl N chars]`

## 数据库迁移

```bash
# 生成迁移文件（根据 schema.ts 变更）
pnpm db:generate

# 执行迁移
pnpm db:migrate
```

迁移文件位于 `server/database/migrations/`，数据库文件位于 `data/mj-studio.db`。

### 添加新迁移

1. 修改 `server/database/schema.ts` 中的表结构
2. 运行 `pnpm db:generate` 生成迁移文件
3. 检查生成的 SQL 文件是否正确
4. 运行 `pnpm db:migrate` 执行迁移
5. 提交 schema.ts 和迁移文件

### 迁移规范

- **禁止手动修改 meta 文件夹**：`_journal.json` 和 `*_snapshot.json` 由工具自动维护
- **snapshot 文件的作用**：记录每次迁移后的完整 schema 状态，用于生成增量迁移
- **自动迁移**：应用启动时通过 Nitro plugin (`server/plugins/migrate.ts`) 自动执行迁移

### 处理需要交互的迁移（重命名/删除列）

`drizzle-kit generate` 在检测到列重命名时会提示用户选择，这在 CI/CD 或非交互环境下无法工作。

**解决方案**：使用 `--custom` 生成空迁移后手动编写 SQL

```bash
# 1. 生成空迁移文件（会同时生成 snapshot）
pnpm drizzle-kit generate --custom --name=my-migration

# 2. 手动编辑生成的 SQL 文件
# 3. 确保 SQL 与 schema.ts 的变更一致
```

**注意**：
- 手动编写 SQL 时必须确保与 schema.ts 的变更完全匹配
- 如果需要数据迁移（如列值转换），在 SQL 中添加 UPDATE 语句
- 复杂的数据迁移可在 `server/plugins/migrate.ts` 中处理（在 SQL 迁移之后执行）

## UI 组件规范

本项目使用 **Nuxt UI 4**，遵循以下规范：

### 表单组件

**必须使用 `UForm` + `UFormField` 组合**，而非手动写 `<label>` 标签：

### 模态框

使用 `UModal` 组件，通过 `:ui` 属性调整宽度：

```

### 样式原则

1. **优先使用组件 props**：如 `color`、`variant`、`size`，而非自定义 class
2. **使用 CSS 变量**：如 `text-(--ui-text-muted)`、`bg-(--ui-bg-elevated)`
3. **避免硬编码颜色**：使用主题变量确保深色模式兼容


## 注意事项

- 添加新模型类型时，需同步更新 `app/shared/types.ts` 和 `app/shared/constants.ts` 中的相关定义
- 测试超时设置为 120 秒（MJ 生图需要较长时间）

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)

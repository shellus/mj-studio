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

- `app/` - 前端代码
  - `pages/` - 页面组件（drawing.vue 绘图、chat.vue 对话、settings/ 设置）
  - `components/` - UI 组件（drawing/ 绘图相关、chat/ 对话相关）
  - `composables/` - 组合式函数（useAuth、useTasks、useConversations 等）
  - `shared/` - 前后端共享的类型和常量
- `server/` - 后端代码
  - `api/` - API 路由
  - `services/` - 业务逻辑（task.ts 绘图任务、chat.ts 对话、各上游 API 封装）
  - `database/` - 数据库 schema 和迁移
- `data/` - 数据存储（SQLite 数据库、上传的图片）
- `logs/` - API 请求/响应日志
- `docs/` - 详细设计文档

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
- `mj.ts`, `gemini.ts`, `dalle.ts`, `openaiChat.ts`: 各上游 API 的封装

### API 格式路由

绘图任务根据 `apiFormat` 字段选择处理方式：
- `mj-proxy`: 异步轮询模式（Midjourney）
- `gemini`, `dalle`, `openai-chat`: 同步请求模式

## API 格式详解

| 请求格式 | 文生图接口 | 垫图接口 | 参考图格式 | 返回图片 |
|---------|-----------|---------|-----------|---------|
| MJ-Proxy | `POST /mj/submit/imagine` | 同左 | Base64 数组 | URL |
| Gemini | `POST /v1beta/models/{model}:generateContent` | 同左 | Base64 (inlineData) | Base64 |
| DALL-E | `POST /v1/images/generations` | 同左 | 纯 Base64 | URL / Base64 |
| DALL-E (豆包) | `POST /v1/images/generations` | 同左 | Data URL (`data:image/...;base64,...`) | URL |
| DALL-E (Flux) | `POST /v1/images/edits` | 同左 | multipart/form-data 文件上传 | Base64 |
| OpenAI Chat | `POST /v1/chat/completions` | 同左 | Base64 Data URL | URL (从 Markdown 解析) |

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

- **必须使用 `drizzle-kit generate`**：禁止手动编写迁移 SQL 文件
- **禁止手动修改 meta 文件夹**：`_journal.json` 和 `*_snapshot.json` 由工具自动维护
- **snapshot 文件的作用**：记录每次迁移后的完整 schema 状态，用于生成增量迁移
- **重置迁移历史**：仅在开发阶段且未上生产时，可删除 `migrations/` 目录重新生成
- **自动迁移**：应用启动时通过 Nitro plugin (`server/plugins/migrate.ts`) 自动执行迁移

## UI 组件规范

本项目使用 **Nuxt UI 3**，遵循以下规范：

### 表单组件

**必须使用 `UForm` + `UFormField` 组合**，而非手动写 `<label>` 标签：

```vue
<!-- ✅ 正确 -->
<UForm :state="formData" :validate="validate" @submit="onSubmit">
  <UFormField label="用户名" name="username" required>
    <UInput v-model="formData.username" placeholder="请输入" />
  </UFormField>
  <UButton type="submit">保存</UButton>
</UForm>

<!-- ❌ 错误：手动写 label -->
<label class="block text-sm mb-2">用户名</label>
<UInput v-model="formData.username" />
```

### 模态框

使用 `UModal` 组件，通过 `:ui` 属性调整宽度：

```vue
<UModal v-model:open="showModal" title="标题" :ui="{ content: 'sm:max-w-xl' }">
  <template #body><!-- 内容 --></template>
  <template #footer>
    <UButton variant="ghost" @click="showModal = false">取消</UButton>
    <UButton color="primary" @click="handleSave">保存</UButton>
  </template>
</UModal>
```

### Toast 通知

使用 `useToast()` 替代 `alert()`：

```typescript
const toast = useToast()
toast.add({ title: '保存成功', color: 'success' })
toast.add({ title: '操作失败', description: '详细信息', color: 'error' })
```

### 样式原则

1. **优先使用组件 props**：如 `color`、`variant`、`size`，而非自定义 class
2. **使用 CSS 变量**：如 `text-(--ui-text-muted)`、`bg-(--ui-bg-elevated)`
3. **避免硬编码颜色**：使用主题变量确保深色模式兼容

## 环境变量

必需的环境变量（存放在 `.env` 文件）：

```bash
# JWT 密钥（必需）
JWT_SECRET=your-secret-key

# HMR 端口（可选，用于 Docker 环境）
NUXT_HMR_PORT=24678
```

## 注意事项

- 添加新模型类型时，需同步更新 `app/shared/types.ts` 和 `app/shared/constants.ts` 中的相关定义
- 测试超时设置为 120 秒（MJ 生图需要较长时间）
- 使用 Sqids 对数据库 ID 进行编码，配置在 `app/shared/constants.ts`

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)

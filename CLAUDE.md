# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MJ-Studio 是一个多模型 AI 工作台，支持 AI 绘图（Midjourney、DALL-E、Gemini、Flux 等）、AI 视频生成（即梦、Veo、Sora、Grok Video 等）和 AI 对话（GPT、Claude、DeepSeek 等）。基于 Nuxt 4 + Drizzle ORM + SQLite 构建。

## 常用命令

```bash
pnpm dev                    # 启动开发服务器
pnpm build                  # 构建生产版本
pnpm db:migrate             # 执行数据库迁移
pnpm test                   # 运行所有测试
npx vue-tsc --noEmit        # 检查 TypeScript 类型错误
```

## 目录结构

```
app/                          # 前端代码
├── pages/                    # 页面
├── components/               # UI 组件
├── composables/              # 组合式函数
└── shared/                   # 前后端共享类型和常量
server/                       # 后端代码
├── api/                      # API 路由
├── services/                 # 业务逻辑
└── database/                 # 数据库 schema 和迁移
data/                         # SQLite 数据库、上传的图片/视频
logs/                         # API 请求/响应日志（按日期和任务ID分组）
docs/                         # 详细设计文档
```

## 前后端共享类型

类型和常量定义在 `app/shared/` 目录，前后端共用：
- `types.ts`: 核心类型定义
- `constants.ts`: 常量和映射表（`MODELS_WITH_*` 控制模型参数支持）

数据库 schema (`server/database/schema.ts`) 从 shared 导入类型，确保类型一致性。

添加新模型类型时，需同步更新 `types.ts` 和 `constants.ts`。

## 数据库迁移

迁移文件位于 `server/database/migrations/`，应用启动时自动执行迁移。

**禁止使用 `pnpm db:generate`**，只使用自定义迁移：

```bash
pnpm drizzle-kit generate --custom --name=my-migration
# 手动编辑生成的 SQL 文件，确保与 schema.ts 变更一致
```

SQLite 迁移文件中多个语句需用 `--> statement-breakpoint` 分隔：

```sql
ALTER TABLE `assistants` ADD `conversation_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `assistants` SET `conversation_count` = (SELECT COUNT(*) FROM `conversations` WHERE ...);
```

我们使用的 SQLite 版本支持`DROP COLUMN`

## 详细文档

`docs/` 目录包含 API 格式、模型参数、架构设计等详细文档，修改相关功能前应先查阅。

各上游 API 的参考图格式、返回格式差异较大（纯 Base64 / Data URL / FormData），不同模型有特殊处理逻辑。

## 资源处理规范

1. **前端提交**：使用本地 URL（`/api/images/xxx`），不直接提交 Base64
2. **数据库存储**：`resourceUrl` 字段存储本地 URL
3. **上游请求**：后端按需将本地 URL 转换为 Base64
4. **结果本地化**：上游返回的资源必须下载/保存到本地

## 全局事件系统

对话和任务模块采用**事件驱动**模式实现多端同步：

- 前端发起 API 请求仅触发操作
- UI 状态变化由后端通过 SSE（`GET /api/events`）推送事件驱动
- 同一用户的所有标签页共享事件流

**composable 中事件处理器必须使用单例模式防止重复注册**：

```typescript
let isEventRegistered = false

export function useXxx() {
  if (import.meta.client && !isEventRegistered) {
    isEventRegistered = true
    on('event.type', handler)
  }
}
```

> 详细设计见 [docs/architecture/全局事件订阅系统设计.md](docs/architecture/全局事件订阅系统设计.md)

## UI 规范

使用 **Nuxt UI 4**，设计风格基于 Fluent 2。详细规范见 [docs/设计系统规范.md](docs/设计系统规范.md)。

- 优先使用组件 props（`color`、`variant`、`size`）而非自定义 class
- 使用 CSS 变量（`text-(--ui-text-muted)`）确保深色模式兼容
- 表单必须使用 `UForm` + `UFormField` 组合


## TypeScript 类型规范

- **数组元素访问**：`array[index]` 返回 `T | undefined`，使用前必须检查（包括正则 match 结果、数据库插入返回值）
- **catch 中的 unknown**：不能直接访问属性，需先断言类型再访问
- **联合类型索引**：用联合类型索引对象时，确保对象键覆盖所有联合成员，或收窄类型
- **接口同步**：修改接口字段时，同步更新所有引用该接口的函数参数类型
- **null vs undefined**：Vue 组件 props 优先使用 `undefined`，保持一致性
- **事件绑定**：模板中绑定的事件处理函数必须在 script 中定义
- **Date 序列化**：通过 SSE/JSON 传输时，`Date` 对象需转为 ISO 字符串（`date.toISOString()`）
- **Nuxt UI 组件**：查阅文档确认 props 结构，如 UModal overlay 需放在 `:ui="{ overlay: ... }"` 内

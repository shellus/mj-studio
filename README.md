# MJ Studio

多模型 AI 绘图工作台，支持 Midjourney、Gemini、Flux、DALL-E、GPT-4o、Grok 等图像生成模型。

![预览](preview.png)

## 简介

MJ Studio 是一个自托管的 AI 绘图平台，允许用户通过统一界面使用多个 AI 图像生成服务。支持用户自定义上游 API 配置，适合个人使用或小团队部署。

## 运行原理

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│   浏览器     │────▶│  Nuxt 服务   │────▶│  上游 API 服务       │
│  (Vue SPA)  │◀────│  (Nitro)    │◀────│  (MJ/Gemini 中转站)  │
└─────────────┘     └──────┬──────┘     └─────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  SQLite   │
                    │  数据库    │
                    └───────────┘
```

1. **前端**：Vue 3 SPA，提交绘图请求，轮询任务状态
2. **后端**：Nitro 服务器，管理任务队列，代理上游 API 请求
3. **数据库**：SQLite 存储用户、任务、模型配置
4. **上游服务**：兼容 MJ-Proxy API 格式的中转站，或 Google Gemini API

## 核心概念

### 上游（Upstream）

上游是指提供 AI 绘图服务的 API 端点，通常是各类中转站服务。

| 字段 | 数据库字段 | 说明 |
|-----|-----------|------|
| 名称 | `name` | 用户自定义的标识名，如"我的MJ"、"云雾API" |
| 请求地址 | `base_url` | API 的基础 URL，如 `https://api.example.com` |
| API 密钥 | `api_key` | 用于鉴权的密钥 |

一个上游可以包含多个**模型配置**。

### 模型配置（Model Config）

每个模型配置定义了如何调用上游的某个具体模型，包含三个核心字段：

| 字段 | 数据库字段 | 说明 |
|-----|-----------|------|
| 请求格式 | `apiFormat` | 决定向上游发起请求的协议格式（MJ-Proxy/Gemini/DALL-E/OpenAI Chat） |
| 模型名称 | `modelName` | 请求时传递的实际模型标识符，影响生成速度、质量和价格 |
| 模型类型 | `modelType` | 用于界面显示的模型大类（Midjourney/Gemini/Flux 等） |

**为什么需要这三个字段？**

- **请求格式**：不同的 AI 服务使用不同的 API 协议。例如 Flux 模型可能通过 DALL-E 格式调用，Gemini 模型也可能通过 OpenAI Chat 格式调用。请求格式决定了我们如何构造 HTTP 请求。

- **模型名称**：同一个模型在不同中转站可能有不同的命名。例如 DALL-E 3 可能被命名为 `dall-e-3`、`dalle-3`、`dall-e-3-hd` 等。用户需要根据自己使用的中转站填写正确的模型名称。

- **模型类型**：一个绘图模型（如 Midjourney）实际上可能包含 30-50 个不同的子模型名称。我们用模型类型将这些复杂性屏蔽掉，让用户在使用界面上只需选择"Midjourney"即可，无需关心底层的具体模型名称。

```
┌─────────────────────────────────────────────────────────┐
│  上游: 我的中转站                                         │
│  base_url: https://api.example.com                      │
│  api_key: sk-xxx                                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 模型配置 1                                       │   │
│  │ modelType: flux      (界面显示: Flux)            │   │
│  │ apiFormat: dalle     (使用 DALL-E API 格式请求)   │   │
│  │ modelName: flux-dev  (实际传给上游的模型名)       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 模型配置 2                                       │   │
│  │ modelType: gemini    (界面显示: Gemini)          │   │
│  │ apiFormat: gemini    (使用 Gemini API 格式请求)   │   │
│  │ modelName: gemini-2.5-flash-image               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 主要功能

### 图像生成
- **文生图**：输入提示词生成图片
- **垫图**（MJ）：上传参考图 + 提示词生成
- **图片混合**（MJ）：多张图片混合生成新图

### 任务管理
- 任务状态实时轮询（等待中/提交中/生成中/完成/失败）
- 失败任务一键重试
- 显示创建时间和耗时

### MJ 专属功能
- U1-U4 放大按钮
- V1-V4 变体按钮
- 重绘按钮

### 多模型支持

| 模型 | 请求格式 | 文生图 | 垫图 | V/U 操作 |
|-----|---------|-------|-----|---------|
| **Midjourney** | MJ-Proxy | ✅ | ✅ | ✅ |
| **Gemini** | Gemini API | ✅ | ✅ | - |
| **Flux** | DALL-E API | ✅ | ✅ | - |
| **DALL-E** | DALL-E API | ✅ | ✅ | - |
| **GPT-4o Image** | OpenAI Chat | ✅ | ✅ | - |
| **Grok Image** | OpenAI Chat | ✅ | ✅ | - |

### 用户系统
- 邮箱密码登录/注册
- 用户级别的模型配置管理
- 每个用户独立的任务列表

## 快速开始

### 环境要求
- Node.js 20+
- pnpm

### 安装运行

```bash
# 安装依赖
pnpm install

# 初始化数据库
pnpm db:push

# 开发模式
pnpm dev
```

访问 http://localhost:3000

### 环境变量

创建 `.env` 文件：

```env
NUXT_SESSION_PASSWORD=your-session-secret-at-least-32-chars
```

## 技术栈

- **框架**：Nuxt 4 + Vue 3
- **UI**：Nuxt UI 3 (Tailwind CSS)
- **数据库**：SQLite + Drizzle ORM
- **认证**：nuxt-auth-utils (Session)

## 目录结构

```
├── app/
│   ├── pages/
│   │   ├── index.vue           # 主页（绘图工作台）
│   │   ├── login.vue           # 登录页
│   │   ├── register.vue        # 注册页
│   │   └── settings.vue        # 模型配置管理
│   ├── components/
│   │   ├── DrawingPanel.vue    # 绘图面板（提示词、参考图、模型选择）
│   │   ├── TaskList.vue        # 任务列表
│   │   └── TaskCard.vue        # 任务卡片（状态、操作按钮）
│   ├── composables/
│   │   ├── useTasks.ts         # 任务状态管理
│   │   └── useModelConfigs.ts  # 模型配置管理
│   └── middleware/
│       └── auth.ts             # 认证中间件
├── server/
│   ├── api/
│   │   ├── auth/               # 认证 API
│   │   ├── tasks/              # 任务 API
│   │   └── model-configs/      # 模型配置 API
│   ├── database/
│   │   ├── index.ts            # 数据库连接
│   │   └── schema.ts           # 表结构定义
│   └── services/
│       ├── task.ts             # 任务服务（调度）
│       ├── mj.ts               # MJ-Proxy 格式
│       ├── gemini.ts           # Gemini 格式
│       ├── dalle.ts            # DALL-E 格式
│       ├── openaiChat.ts       # OpenAI Chat 格式
│       ├── types.ts            # 统一类型定义
│       └── modelConfig.ts      # 模型配置服务
├── drizzle.config.ts           # Drizzle 配置
└── nuxt.config.ts              # Nuxt 配置
```

## API 兼容性

### MJ-Proxy 格式
兼容 [midjourney-proxy](https://github.com/novicezk/midjourney-proxy) API：
- `POST /mj/submit/imagine` - 文生图
- `POST /mj/submit/blend` - 图片混合
- `POST /mj/submit/action` - 按钮操作
- `GET /mj/task/{id}/fetch` - 查询任务

### Gemini 格式
使用 Google Generative Language API：
- `POST /v1beta/models/{model}:generateContent`

### DALL-E 格式
兼容 OpenAI Images API：
- `POST /v1/images/generations` - 文生图
- `POST /v1/images/edits` - 垫图编辑

### OpenAI Chat 格式
兼容 OpenAI Chat Completions API（支持图像生成的模型）：
- `POST /v1/chat/completions` - 文生图/垫图

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)
- [Gemini API 图像生成](https://ai.google.dev/gemini-api/docs/image-generation)

# MJ Studio

多模型 AI 绘图工作台，支持 Midjourney 和 Gemini 图像生成。

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
- **Midjourney**：通过兼容 MJ-Proxy 的中转站
- **Gemini**：Google Gemini 2.5 Flash Image 模型

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
│       ├── task.ts             # 任务服务
│       ├── mj.ts               # MJ API 封装
│       ├── gemini.ts           # Gemini API 封装
│       └── modelConfig.ts      # 模型配置服务
├── drizzle.config.ts           # Drizzle 配置
└── nuxt.config.ts              # Nuxt 配置
```

## API 兼容性

### Midjourney
兼容 [midjourney-proxy](https://github.com/novicezk/midjourney-proxy) API 格式：
- `POST /mj/submit/imagine` - 文生图
- `POST /mj/submit/blend` - 图片混合
- `POST /mj/submit/action` - 按钮操作
- `GET /mj/task/{id}/fetch` - 查询任务

### Gemini
使用 Google Generative Language API：
- `POST /v1beta/models/gemini-2.5-flash-image:generateContent`

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)
- [Gemini API 图像生成](https://ai.google.dev/gemini-api/docs/image-generation)

# 开发文档

核心概念（上游、模型配置）请参考 [README](../README.md#核心概念)。

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

## API 格式详解

| 请求格式 | 文生图接口 | 垫图接口 | 参考图上传 | 图片下载 |
|---------|-----------|---------|-----------|---------|
| MJ-Proxy | `POST /mj/submit/imagine` | `POST /mj/submit/imagine` | Base64 | URL |
| Gemini | `POST /v1beta/models/{model}:generateContent` | 同左 | Base64 (inlineData) | Base64 |
| DALL-E | `POST /v1/images/generations` | `POST /v1/images/edits` | Base64 (FormData) | URL / Base64 |
| OpenAI Chat | `POST /v1/chat/completions` | 同左 | Base64 (image_url) | URL (从content解析) |

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

兼容 OpenAI Images API：
- `POST /v1/images/generations` - 文生图，返回 `data[].url` 或 `data[].b64_json`
- `POST /v1/images/edits` - 垫图，使用 `multipart/form-data` 上传参考图

### OpenAI Chat 格式

兼容 OpenAI Chat Completions API（支持图像生成的模型）：
- `POST /v1/chat/completions` - 文生图/垫图
- 垫图时参考图通过 `content[].image_url.url` 字段上传 (支持 Base64 Data URL)
- 返回图片 URL 从 `choices[].message.content` 中解析 (Markdown格式)

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)
- [Gemini API 图像生成](https://ai.google.dev/gemini-api/docs/image-generation)

# 开发文档

> **重要**：开始开发前请先阅读本文档和 [README](README.md)。

核心概念（上游、模型配置）请参考 [README](README.md#核心概念)。

## 目录结构

```
├── app/
│   ├── pages/
│   │   ├── index.vue           # 主页（绘图工作台）
│   │   ├── login.vue           # 登录页
│   │   ├── register.vue        # 注册页
│   │   ├── settings.vue        # 模型配置管理
│   │   └── trash.vue           # 回收站
│   ├── components/
│   │   ├── DrawingPanel.vue    # 绘图面板（提示词、参考图、模型选择）
│   │   ├── TaskList.vue        # 任务列表（分页、批量操作）
│   │   ├── TaskCard.vue        # 任务卡片（状态、操作按钮、参考图查看）
│   │   └── TrashList.vue       # 回收站列表
│   ├── composables/
│   │   ├── useTasks.ts         # 任务状态管理
│   │   ├── useTrash.ts         # 回收站状态管理
│   │   └── useModelConfigs.ts  # 模型配置管理
│   ├── utils/
│   │   └── sqids.ts            # 任务ID编解码（短链接）
│   └── middleware/
│       └── auth.ts             # 认证中间件
├── server/
│   ├── api/
│   │   ├── auth/               # 认证 API
│   │   ├── tasks/              # 任务 API（CRUD、重试、批量模糊、回收站）
│   │   └── model-configs/      # 模型配置 API
│   ├── database/
│   │   ├── index.ts            # 数据库连接
│   │   └── schema.ts           # 表结构定义
│   └── services/
│       ├── task.ts             # 任务服务（调度、软删除、回收站）
│       ├── mj.ts               # MJ-Proxy 格式
│       ├── gemini.ts           # Gemini 格式
│       ├── dalle.ts            # DALL-E 格式（含豆包、Flux特殊处理）
│       ├── openaiChat.ts       # OpenAI Chat 格式
│       ├── logger.ts           # 请求/响应日志服务
│       ├── image.ts            # 图片下载/保存服务
│       ├── types.ts            # 统一类型定义
│       └── modelConfig.ts      # 模型配置服务
├── logs/                       # API 请求/响应日志（按日期/任务ID组织）
├── data/                       # SQLite 数据库文件
├── drizzle.config.ts           # Drizzle 配置
└── nuxt.config.ts              # Nuxt 配置
```

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

## 参考链接

- [Nuxt 4 文档](https://nuxt.com/docs)
- [Nuxt UI 3 文档](https://ui.nuxt.com/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [midjourney-proxy API](https://github.com/novicezk/midjourney-proxy)
- [Gemini API 图像生成](https://ai.google.dev/gemini-api/docs/image-generation)

## UI 组件规范

本项目使用 **Nuxt UI 3**，遵循以下规范以保持一致性，避免过度自定义样式。

### 表单组件

**必须使用 `UForm` + `UFormField` 组合**，而非手动写 `<label>` 标签：

```vue
<!-- ✅ 正确 -->
<UForm :state="formData" :validate="validate" @submit="onSubmit">
  <UFormField label="用户名" name="username" required>
    <UInput v-model="formData.username" placeholder="请输入" />
  </UFormField>

  <UFormField label="描述" name="description">
    <UTextarea v-model="formData.description" :rows="4" />
  </UFormField>

  <UButton type="submit">保存</UButton>
</UForm>

<!-- ❌ 错误：手动写 label -->
<label class="block text-sm mb-2">用户名</label>
<UInput v-model="formData.username" />
```

**表单验证**使用 `validate` 函数：

```typescript
import type { FormSubmitEvent, FormError } from '@nuxt/ui'

function validate(state: typeof formData): FormError[] {
  const errors: FormError[] = []
  if (!state.username?.trim()) {
    errors.push({ name: 'username', message: '请输入用户名' })
  }
  return errors
}

function onSubmit(event: FormSubmitEvent<typeof formData>) {
  // event.data 包含验证通过的表单数据
}
```

### 模态框

使用 `UModal` 组件，通过 `:ui` 属性调整宽度：

```vue
<UModal
  v-model:open="showModal"
  title="标题"
  description="可选描述"
  :ui="{ content: 'sm:max-w-xl' }"
>
  <template #body>
    <!-- 内容 -->
  </template>

  <template #footer>
    <UButton variant="ghost" @click="showModal = false">取消</UButton>
    <UButton color="primary" @click="handleSave">保存</UButton>
  </template>
</UModal>
```

常用宽度：`sm:max-w-lg`（默认）、`sm:max-w-xl`、`sm:max-w-2xl`、`sm:max-w-4xl`

### 下拉菜单

选择列表使用 `UDropdownMenu`，支持分组：

```vue
<UDropdownMenu :items="menuItems">
  <UButton variant="outline">
    {{ displayText }}
    <UIcon name="i-heroicons-chevron-down" />
  </UButton>
</UDropdownMenu>

<script setup>
const menuItems = computed(() => [
  [
    { label: '分组标题', type: 'label' },
    { label: '选项1', onSelect: () => handleSelect(1) },
    { label: '选项2', onSelect: () => handleSelect(2) },
  ],
  [
    { label: '另一分组', type: 'label' },
    { label: '选项3', onSelect: () => handleSelect(3) },
  ],
])
</script>
```

### Toast 通知

使用 `useToast()` 替代 `alert()`：

```typescript
const toast = useToast()

// 成功
toast.add({ title: '保存成功', color: 'success' })

// 错误
toast.add({ title: '操作失败', description: '详细信息', color: 'error' })

// 警告
toast.add({ title: '请注意', color: 'warning' })
```

### 按钮

```vue
<!-- 主要操作 -->
<UButton color="primary">保存</UButton>

<!-- 次要操作 -->
<UButton variant="outline" color="neutral">编辑</UButton>

<!-- 文字按钮 -->
<UButton variant="ghost">取消</UButton>

<!-- 危险操作 -->
<UButton color="error">删除</UButton>

<!-- 带图标 -->
<UButton>
  <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
  添加
</UButton>
```

### 样式原则

1. **优先使用组件 props**：如 `color`、`variant`、`size`，而非自定义 class
2. **使用 CSS 变量**：如 `text-(--ui-text-muted)`、`bg-(--ui-bg-elevated)`
3. **避免硬编码颜色**：使用主题变量确保深色模式兼容
4. **间距使用 Tailwind**：`space-y-4`、`gap-2`、`p-4` 等
5. **响应式优先**：移动端优先，必要时使用 `sm:`、`md:` 前缀

### 图标

使用 Heroicons，通过 `UIcon` 组件：

```vue
<UIcon name="i-heroicons-plus" class="w-4 h-4" />
<UIcon name="i-heroicons-trash" class="w-5 h-5" />
<UIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
```

常用图标：`plus`、`trash`、`pencil`、`x-mark`、`chevron-down`、`cpu-chip`、`user-circle`、`cloud-arrow-up`

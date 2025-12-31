# RFC: 模型参数架构重构

> 状态：待实施
>
> 创建时间：2025-12-29

## 背景

### 问题发现

在测试 Sora 视频生成时（任务 ID #23），发现请求失败：

```json
{"error": "size is required for sora-2"}
```

根本原因：前端 `VideoForm.vue` 只为即梦和 Veo 渲染了参数组件，没有处理 Sora 和 Grok Video 的特有参数。

### 现有架构问题

当前架构将参数分散在多个位置：

```sql
-- tasks 表
negative_prompt    -- 生图模型专用

-- task_video 表
aspect_ratio       -- 视频通用？但 Sora 不用
size               -- 即梦专用
enhance_prompt     -- Veo 专用
enable_upsample    -- Veo 专用
image_mode         -- Veo 专用
enhanced_prompt    -- 上游返回值（无需持久化）
```

问题：
1. **扩展性差**：每新增一个视频模型都需要修改 schema、生成迁移、更新文档
2. **字段爆炸**：Sora 需要 `orientation`、`duration`、`watermark`、`private` 四个新字段
3. **不一致**：生图参数在 `tasks` 表，视频参数在 `task_video` 表
4. **冗余表**：`task_video` 表字段分析后发现可完全移除

### task_video 表字段分析

| 字段 | 当前用途 | 分析结论 |
|-----|---------|---------|
| `aspectRatio` | 宽高比 | Sora 用 `orientation` 代替，并非真正通用，应放 `modelParams` |
| `imageMode` | 图片模式 | Veo 专用，应放 `modelParams` |
| `size` | 分辨率 | 即梦专用，应放 `modelParams` |
| `enhancePrompt` | 提示词增强 | Veo 专用，应放 `modelParams` |
| `enableUpsample` | 超分辨率 | Veo 专用，应放 `modelParams` |
| `enhancedPrompt` | 上游返回的增强提示词 | 过程数据，无需持久化 |

**结论：task_video 表可完全移除**

### 各视频模型参数对比

| 参数 | 即梦 | Veo | Sora | Grok Video | 说明 |
|-----|------|-----|------|------------|------|
| `aspectRatio` | ✅ | ✅ | ❌ | ✅ | 宽高比 |
| `size` | ✅ 分辨率 | ❌ | ✅ 必填 | ✅ | 含义因模型而异 |
| `orientation` | ❌ | ❌ | ✅ | ❌ | Sora 用这个代替宽高比 |
| `duration` | ❌ | ❌ | ✅ | ❌ | 视频时长 |
| `enhancePrompt` | ❌ | ✅ | ❌ | ❌ | 提示词增强 |
| `enableUpsample` | ❌ | ✅ | ❌ | ❌ | 超分辨率 |
| `imageMode` | ❌ | ✅ | ❌ | ❌ | 图片模式 |
| `watermark` | ❌ | ❌ | ✅ | ❌ | 水印控制 |
| `private` | ❌ | ❌ | ✅ | ❌ | 隐私模式 |

待集成的模型（海螺、可灵、豆包视频等）还有更多特有参数，如首尾帧、多图参考等。

### 各生图模型参数对比

> 数据来源：https://yunwu.apifox.cn/llms.txt

#### 按 API 格式分类

| API 格式 | 模型 | 专用参数 |
|---------|------|---------|
| **mj-proxy** | Midjourney | `botType` |
| **gemini** | Gemini Image | 无（通过 prompt 控制） |
| **dalle** | DALL-E 3, GPT-Image, Flux, 豆包 | `size`, `n`, `quality`, `style`, `aspectRatio`, `seed`, `guidanceScale`, `watermark` |
| **openai-chat** | GPT-4o Image, Grok Image, 通义万相 | 无（通过 prompt 中的指令控制） |

#### 各格式详细参数

##### MJ-Proxy 格式 (Midjourney)

| 参数 | 类型 | 说明 |
|-----|------|-----|
| `botType` | `'MID_JOURNEY' \| 'NIJI_JOURNEY'` | 机器人类型 |

> `negativePrompt` 通过 `--no` 参数在 prompt 中传递

##### DALL-E 格式 (DALL-E 3, GPT-Image, Flux, 豆包)

| 参数 | 类型 | 适用模型 | 说明 |
|-----|------|---------|-----|
| `size` | string | 全部 | 尺寸：1024x1024, 1792x1024, 1024x1792 等 |
| `n` | number | 全部 | 生成数量：1-10 |
| `quality` | `'standard' \| 'hd'` | DALL-E 3 | 质量 |
| `style` | `'vivid' \| 'natural'` | DALL-E 3 | 风格 |
| `aspectRatio` | string | Flux | 宽高比：21:9, 16:9, 1:1 等 |
| `seed` | number | 豆包 | 随机种子：-1 到 2147483647 |
| `guidanceScale` | number | 豆包 | 提示词相关度：1-10，默认 2.5 |
| `watermark` | boolean | 豆包 | 水印：默认 true |

##### Gemini 格式

无专用参数，通过 `generationConfig.responseModalities` 控制输出类型。

##### OpenAI Chat 格式 (GPT-4o Image, Grok Image)

无专用参数，尺寸等通过 prompt 中的指令控制（如 `尺寸[4:3]`）。

---

## 方案设计

### 核心思路

1. 在 `tasks` 表新增 `modelParams` JSON 字段，存储所有模型专用参数
2. 移除 `tasks.negativePrompt` 字段，迁移到 `modelParams`
3. **完全移除 `task_video` 表**

### 表结构变更

#### tasks 表

```diff
tasks (
  ...
  prompt,
  images,
- negative_prompt,     -- 移除，迁移到 modelParams
+ model_params,        -- NEW: TEXT (JSON)，所有模型专用参数
  ...
)
```

#### task_video 表

```diff
- task_video 表        -- 完全移除
```

### 最终结构

```
tasks 表
├── id, userId, ...    -- 基础字段
├── prompt             -- 通用：提示词
├── images             -- 通用：参考图数组
├── modelParams        -- NEW: JSON，所有模型专用参数
└── ...
```

### modelParams 字段设计

#### 类型定义

```typescript
// ============ 生图模型参数 ============

// 通用生图参数（多格式共用）
interface ImageModelParams {
  negativePrompt?: string      // 负面提示词（MJ、Flux）
  size?: string                // 尺寸：1024x1024 等（DALL-E、GPT-Image、豆包）
  aspectRatio?: string         // 宽高比：16:9 等（Flux）
  n?: number                   // 生成数量：1-10
  seed?: number                // 随机种子（豆包）
  quality?: 'standard' | 'hd'  // 质量（DALL-E 3）
  style?: 'vivid' | 'natural'  // 风格（DALL-E 3）
  guidanceScale?: number       // 提示词相关度：1-10（豆包）
  watermark?: boolean          // 水印（豆包）
  botType?: 'MID_JOURNEY' | 'NIJI_JOURNEY'  // 机器人类型（MJ）
}

// ============ 视频模型参数 ============

// 即梦视频参数
interface JimengVideoParams {
  aspectRatio?: string         // 宽高比：16:9, 9:16, 4:3, 3:4, 1:1, 21:9
  size?: string                // 分辨率：1080P、1280x720、720x1280
}

// Veo 视频参数
interface VeoVideoParams {
  aspectRatio?: string         // 宽高比：16:9, 9:16
  enhancePrompt?: boolean      // 提示词增强
  enableUpsample?: boolean     // 超分辨率
  imageMode?: 'reference' | 'frames' | 'components'  // 图片模式
}

// Sora 视频参数
interface SoraVideoParams {
  orientation?: 'portrait' | 'landscape'  // 方向（替代宽高比）
  size: 'small' | 'large'                 // 分辨率（必填）
  duration?: number                        // 时长：10、15 等
  watermark?: boolean                      // 水印
  private?: boolean                        // 隐私模式
}

// Grok Video 参数
interface GrokVideoParams {
  aspectRatio?: string         // 宽高比：2:3, 3:2, 1:1
  size?: string                // 分辨率：720P
}

// ============ 联合类型 ============

type ModelParams = ImageModelParams | JimengVideoParams | VeoVideoParams | SoraVideoParams | GrokVideoParams
```

#### 存储示例

```json
// ============ 生图模型 ============

// Midjourney
{"negativePrompt": "blurry, low quality", "botType": "MID_JOURNEY"}

// Flux
{"negativePrompt": "blurry", "aspectRatio": "16:9"}

// DALL-E 3
{"size": "1792x1024", "quality": "hd", "style": "vivid"}

// 豆包
{"size": "1024x1024", "seed": 12345, "guidanceScale": 2.5, "watermark": false}

// Gemini / GPT-4o Image / Grok Image
{}  // 无专用参数

// ============ 视频模型 ============

// 即梦视频
{"aspectRatio": "16:9", "size": "1080P"}

// Veo 视频
{"aspectRatio": "16:9", "enhancePrompt": true, "enableUpsample": false, "imageMode": "reference"}

// Sora 视频
{"orientation": "portrait", "size": "large", "duration": 15, "watermark": false, "private": true}

// Grok Video
{"aspectRatio": "3:2", "size": "720P"}
```

---

## 实施步骤

### 1. 数据库迁移

> **注意**：不做历史数据迁移，直接删除旧字段和表。历史任务的 `negativePrompt` 和视频参数将丢失，这是可接受的。

```sql
-- 1. 添加新字段
ALTER TABLE tasks ADD COLUMN model_params TEXT;

-- 2. 删除旧字段（不迁移历史数据）
ALTER TABLE tasks DROP COLUMN negative_prompt;

-- 3. 删除 task_video 表（不迁移历史数据）
DROP TABLE task_video;
```

### 2. Schema 更新

修改 `server/database/schema.ts`：

```typescript
// tasks 表
export const tasks = sqliteTable('tasks', {
  // ... 其他字段保持不变
  modelParams: text('model_params'),  // JSON 字符串
  // 删除 negativePrompt 字段
})

// 删除整个 taskVideo 表定义
// export const taskVideo = sqliteTable('task_video', { ... })
```

### 3. 类型定义

在 `app/shared/types.ts` 添加：

```typescript
// ============ 模型参数类型 ============

// 生图模型参数
export interface ImageModelParams {
  negativePrompt?: string
}

// 即梦视频参数
export interface JimengVideoParams {
  aspectRatio?: string
  size?: string
}

// Veo 视频参数
export interface VeoVideoParams {
  aspectRatio?: string
  enhancePrompt?: boolean
  enableUpsample?: boolean
  imageMode?: 'reference' | 'frames' | 'components'
}

// Sora 视频参数
export interface SoraVideoParams {
  orientation?: 'portrait' | 'landscape'
  size: 'small' | 'large'  // Sora 必填
  duration?: number
  watermark?: boolean
  private?: boolean
}

// Grok Video 参数
export interface GrokVideoParams {
  aspectRatio?: string
  size?: string
}

// 模型参数联合类型
export type ModelParams =
  | ImageModelParams
  | JimengVideoParams
  | VeoVideoParams
  | SoraVideoParams
  | GrokVideoParams
```

### 4. 后端更新

#### 4.1 任务创建 (`server/services/task.ts`)

```typescript
// 创建任务时，将 modelParams 序列化存储
async function createTask(data: CreateTaskData) {
  // ...
  await db.insert(tasks).values({
    // ...
    modelParams: data.modelParams ? JSON.stringify(data.modelParams) : null,
  })

  // 删除创建 task_video 记录的代码
}
```

#### 4.2 视频提交 (`server/services/task.ts` - `submitToVideoUnified`)

```typescript
async function submitToVideoUnified(task: Task, upstream: Upstream, aimodel: Aimodel) {
  // 解析 modelParams
  const modelParams = task.modelParams ? JSON.parse(task.modelParams) : {}

  const params: VideoCreateParams = {
    model: task.modelName,
    prompt: task.prompt ?? '',
  }

  // 根据模型类型添加参数
  const modelType = aimodel.modelType

  if (modelType === 'jimeng-video') {
    if (modelParams.aspectRatio) params.aspect_ratio = modelParams.aspectRatio
    if (modelParams.size) params.size = modelParams.size
  } else if (modelType === 'veo') {
    if (modelParams.aspectRatio) params.aspect_ratio = modelParams.aspectRatio
    if (modelParams.enhancePrompt !== undefined) params.enhance_prompt = modelParams.enhancePrompt
    if (modelParams.enableUpsample !== undefined) params.enable_upsample = modelParams.enableUpsample
    // imageMode 用于前端显示，不传给上游
  } else if (modelType === 'sora') {
    if (modelParams.orientation) params.orientation = modelParams.orientation
    if (modelParams.size) params.size = modelParams.size  // Sora 必填
    if (modelParams.duration) params.duration = modelParams.duration
    if (modelParams.watermark !== undefined) params.watermark = modelParams.watermark
    if (modelParams.private !== undefined) params.private = modelParams.private
  } else if (modelType === 'grok-video') {
    if (modelParams.aspectRatio) params.aspect_ratio = modelParams.aspectRatio
    if (modelParams.size) params.size = modelParams.size
  }

  // 参考图处理...
}
```

#### 4.3 VideoCreateParams 类型扩展 (`server/services/videoUnified.ts`)

```typescript
interface VideoCreateParams {
  model: string
  prompt: string
  aspect_ratio?: string
  images?: string[]
  // 即梦 & Grok
  size?: string
  // Veo
  enhance_prompt?: boolean
  enable_upsample?: boolean
  // Sora
  orientation?: 'portrait' | 'landscape'
  duration?: number
  watermark?: boolean
  private?: boolean
}
```

#### 4.4 API 路由 (`server/api/tasks/index.post.ts`)

```typescript
// 接收参数变更
const {
  // ...
  modelParams,  // 替代 negativePrompt 和 videoParams
} = body

// 创建任务
const task = await taskService.createTask({
  // ...
  modelParams,  // 替代 negativePrompt 和 videoParams
})
```

#### 4.5 DALL-E 服务 (`server/services/dalle.ts`)

```typescript
// 函数签名变更
async function generateImage(
  prompt: string,
  modelName: string,
  taskId?: number,
  signal?: AbortSignal,
  modelParams?: ImageModelParams  // 替代 negativePrompt 参数
): Promise<GenerateResult> {
  // ...
  if (modelParams?.negativePrompt) {
    body.negative_prompt = modelParams.negativePrompt
  }
}
```

#### 4.6 视频状态同步 (`server/services/task.ts` - `syncVideoUnifiedStatus`)

```typescript
// 删除更新 taskVideo 表的代码
// 之前：
// if (result.enhanced_prompt) {
//   await db.update(taskVideo)
//     .set({ enhancedPrompt: result.enhanced_prompt })
//     .where(eq(taskVideo.taskId, task.id))
// }

// 之后：直接删除这段代码
// enhanced_prompt 是过程数据，不再持久化
```

#### 4.7 清理代码

- 删除所有 `taskVideo` 相关的数据库操作
- 删除 `server/database/schema.ts` 中的 `taskVideo` 表定义和 relations
- 删除 `server/services/task.ts` 中的 `VideoParams` 接口定义
- 删除 `server/services/task.ts` 中的 `createTask` 函数里创建 `taskVideo` 记录的代码

### 5. 前端更新

#### 5.1 VideoForm.vue

根据 `selectedAimodel.modelType` 渲染对应的参数组件：

```vue
<template>
  <!-- 即梦：宽高比 + 分辨率 -->
  <template v-if="isJimengModel">
    <UFormField label="宽高比">
      <USelect v-model="modelParams.aspectRatio" :items="jimengAspectRatioOptions" />
    </UFormField>
    <UFormField label="分辨率">
      <USelect v-model="modelParams.size" :items="jimengSizeOptions" />
    </UFormField>
  </template>

  <!-- Veo：宽高比 + 提示词增强 + 超分 -->
  <template v-if="isVeoModel">
    <UFormField label="宽高比">
      <USelect v-model="modelParams.aspectRatio" :items="veoAspectRatioOptions" />
    </UFormField>
    <USwitch v-model="modelParams.enhancePrompt" label="提示词增强" />
    <USwitch v-model="modelParams.enableUpsample" label="超分辨率" />
  </template>

  <!-- Sora：方向 + 分辨率 + 时长 + 水印 + 隐私 -->
  <template v-if="isSoraModel">
    <UFormField label="方向">
      <USelect v-model="modelParams.orientation" :items="soraOrientationOptions" />
    </UFormField>
    <UFormField label="分辨率" required>
      <USelect v-model="modelParams.size" :items="soraSizeOptions" />
    </UFormField>
    <UFormField label="时长">
      <USelect v-model="modelParams.duration" :items="soraDurationOptions" />
    </UFormField>
    <USwitch v-model="modelParams.watermark" label="添加水印" />
    <USwitch v-model="modelParams.private" label="隐私模式" />
  </template>

  <!-- Grok Video：宽高比 + 分辨率 -->
  <template v-if="isGrokVideoModel">
    <UFormField label="宽高比">
      <USelect v-model="modelParams.aspectRatio" :items="grokAspectRatioOptions" />
    </UFormField>
    <UFormField label="分辨率">
      <USelect v-model="modelParams.size" :items="grokSizeOptions" disabled />
    </UFormField>
  </template>
</template>

<script setup lang="ts">
import type { ModelParams } from '~/shared/types'

const modelParams = ref<ModelParams>({})

// 模型类型判断
const isJimengModel = computed(() => selectedAimodel.value?.modelType === 'jimeng-video')
const isVeoModel = computed(() => selectedAimodel.value?.modelType === 'veo')
const isSoraModel = computed(() => selectedAimodel.value?.modelType === 'sora')
const isGrokVideoModel = computed(() => selectedAimodel.value?.modelType === 'grok-video')

// 选项配置
const jimengAspectRatioOptions = [
  { label: '16:9 (横屏)', value: '16:9' },
  { label: '9:16 (竖屏)', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '1:1 (方形)', value: '1:1' },
  { label: '21:9 (超宽)', value: '21:9' },
]
const jimengSizeOptions = [
  { label: '1080P', value: '1080P' },
  { label: '1280x720', value: '1280x720' },
  { label: '720x1280', value: '720x1280' },
]

const veoAspectRatioOptions = [
  { label: '16:9 (横屏)', value: '16:9' },
  { label: '9:16 (竖屏)', value: '9:16' },
]

const soraOrientationOptions = [
  { label: '横屏', value: 'landscape' },
  { label: '竖屏', value: 'portrait' },
]
const soraSizeOptions = [
  { label: '标准 (720p)', value: 'small' },
  { label: '高清', value: 'large' },
]
const soraDurationOptions = [
  { label: '10 秒', value: 10 },
  { label: '15 秒', value: 15 },
]

const grokAspectRatioOptions = [
  { label: '3:2 (横屏)', value: '3:2' },
  { label: '2:3 (竖屏)', value: '2:3' },
  { label: '1:1 (方形)', value: '1:1' },
]
const grokSizeOptions = [
  { label: '720P', value: '720P' },
]

// 切换模型时重置参数并设置默认值
watch(selectedAimodel, (newModel) => {
  if (newModel?.modelType === 'jimeng-video') {
    modelParams.value = { aspectRatio: '16:9', size: '1080P' }
  } else if (newModel?.modelType === 'veo') {
    modelParams.value = { aspectRatio: '16:9', enhancePrompt: true, enableUpsample: false }
  } else if (newModel?.modelType === 'sora') {
    modelParams.value = { orientation: 'landscape', size: 'small', duration: 10 }
  } else if (newModel?.modelType === 'grok-video') {
    modelParams.value = { aspectRatio: '3:2', size: '720P' }
  } else {
    modelParams.value = {}
  }
})

// 提交时传递 modelParams
function handleSubmit() {
  emit('submit', {
    // ...
    modelParams: modelParams.value,
  })
}
</script>
```

#### 5.2 ImageForm.vue

将 `negativePrompt` 改为使用 `modelParams`：

```typescript
// 之前
emit('submit', { negativePrompt: negativePrompt.value })

// 之后
emit('submit', { modelParams: { negativePrompt: negativePrompt.value } })
```

#### 5.3 Workbench.vue

```typescript
// 接收 modelParams 替代 negativePrompt 和 videoParams
function handleSubmit(data: {
  prompt: string
  images: string[]
  modelParams?: ModelParams  // 替代 negativePrompt 和 videoParams
}) {
  // 直接传递 modelParams 到 API
}
```

#### 5.4 useTasks.ts

```typescript
// Task 类型更新
interface Task {
  // ...
  modelParams?: string  // JSON 字符串，替代 negativePrompt
  // 删除 negativePrompt 字段
}
```

#### 5.5 studio.vue

更新提交逻辑，传递 `modelParams` 到 API。

#### 5.6 Card.vue / List.vue

如果有显示 `negativePrompt` 的地方，改为从 `modelParams` 解析。

#### 5.7 清理代码

- 删除 `VideoForm.vue` 中旧的 `videoParams` 相关代码
- 删除 `Workbench.vue` 中处理 `videoParams` 的代码

---

## 扩展性说明

### 新增视频模型

以"海螺"为例，假设它支持首尾帧：

1. **无需数据库迁移**：直接在 `modelParams` 中存储新参数
2. **类型定义**：添加 `HailuoVideoParams` 接口
3. **前端**：在 `VideoForm.vue` 添加 `isHailuoModel` 判断和对应 UI
4. **后端**：在 `submitToVideoUnified` 或新服务中添加参数映射

```typescript
// 类型
interface HailuoVideoParams {
  aspectRatio?: string
  firstFrame?: string   // 首帧图片 URL
  lastFrame?: string    // 尾帧图片 URL
}

// 后端
if (modelType === 'hailuo') {
  if (modelParams.aspectRatio) params.aspect_ratio = modelParams.aspectRatio
  if (modelParams.firstFrame) params.first_frame = modelParams.firstFrame
  if (modelParams.lastFrame) params.last_frame = modelParams.lastFrame
}
```

### 新增生图模型参数

以"通义万相"为例，假设它支持 `style` 参数：

```typescript
// 类型扩展
interface ImageModelParams {
  negativePrompt?: string
  style?: string  // 新增
}

// 前端：在 ImageForm 添加样式选择器
// 后端：在对应服务中读取并传递
```

---

## 需要修改的文件清单

### 数据库层
| 文件 | 修改内容 |
|------|---------|
| `server/database/schema.ts` | 添加 `modelParams`，删除 `negativePrompt`，删除 `taskVideo` 表 |
| `server/database/migrations/xxxx.sql` | 迁移文件（通过 `pnpm db:generate --custom` 生成） |

### 类型定义
| 文件 | 修改内容 |
|------|---------|
| `app/shared/types.ts` | 添加 `ModelParams` 类型定义 |

### 后端服务
| 文件 | 修改内容 |
|------|---------|
| `server/services/task.ts` | 修改 `createTask`、`submitToVideoUnified`、`syncVideoUnifiedStatus`，删除 `VideoParams` 接口 |
| `server/services/dalle.ts` | 修改 `generateImage` 函数签名，使用 `modelParams` |
| `server/api/tasks/index.post.ts` | 接收 `modelParams` 替代 `negativePrompt` 和 `videoParams` |

### 前端组件
| 文件 | 修改内容 |
|------|---------|
| `app/composables/useTasks.ts` | Task 类型添加 `modelParams`，删除 `negativePrompt` |
| `app/components/studio/VideoForm.vue` | 添加 Sora/Grok Video 参数 UI，使用 `modelParams` |
| `app/components/studio/ImageForm.vue` | 使用 `modelParams` 替代 `negativePrompt` |
| `app/components/studio/Workbench.vue` | 传递 `modelParams` |
| `app/pages/studio.vue` | 传递 `modelParams` 到 API |
| `app/components/studio/Card.vue` | 从 `modelParams` 解析显示（如有需要） |

### 可能涉及（需确认）
| 文件 | 修改内容 |
|------|---------|
| `server/api/illustrations/regenerate.post.ts` | 如使用 `negativePrompt` 需更新 |
| `server/api/illustrations/index.post.ts` | 如使用 `negativePrompt` 需更新 |

---

## 测试清单

- [ ] 即梦视频生成正常（aspectRatio、size 参数传递）
- [ ] Veo 视频生成正常（aspectRatio、enhancePrompt、enableUpsample 参数传递）
- [ ] Sora 视频生成正常（orientation、size、duration 等参数传递）
- [ ] Grok Video 视频生成正常（aspectRatio、size 参数传递）
- [ ] MJ/Flux 生图正常（negativePrompt 参数传递）
- [ ] 前端根据模型类型显示对应参数组件
- [ ] 切换模型时参数正确重置
- [ ] task_video 表已删除，无残留引用
- [ ] 代码中无 `negativePrompt` 和 `videoParams` 残留

---

## 参考资料

- [视频模型开发指南](./视频模型开发指南.md)
- [视频统一格式 API](./api/yunwu-video/video-unified.md)
- 相关日志：`logs/2025-12-28/23/` (Sora size 参数缺失错误)

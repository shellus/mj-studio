# ImageForm 模型参数开发方案

## 概述

参考 `VideoForm.vue` 的实现模式，为 `ImageForm.vue` 添加根据模型类型显示不同参数控件的功能。

## 当前状态

### 已支持的参数
- **负面提示词** (`negativePrompt`): 仅 `flux`, `doubao`, `z-image` 模型显示

### 缺少的参数
根据 API 文档分析，各模型还支持以下参数：

| 模型类型 | 缺少的参数 |
|---------|----------|
| `dalle` | `size`, `quality`, `style` |
| `doubao` | `size`, `seed`, `guidanceScale`, `watermark` |
| `flux` | `aspectRatio` |
| `gpt4o-image` | `size`, `quality`, `background` |

## 开发方案

### 1. 类型定义更新

`app/shared/types.ts` 中的 `ImageModelParams` 已包含所有需要的字段：

```typescript
export interface ImageModelParams {
  negativePrompt?: string       // MJ、Flux
  size?: string                 // DALL-E、GPT-Image、豆包
  aspectRatio?: string          // Flux
  n?: number                    // 生成数量
  seed?: number                 // 豆包
  quality?: 'standard' | 'hd'   // DALL-E 3
  style?: 'vivid' | 'natural'   // DALL-E 3
  guidanceScale?: number        // 豆包
  watermark?: boolean           // 豆包
  botType?: 'MID_JOURNEY' | 'NIJI_JOURNEY' // MJ
}
```

**需要扩展**：
- `quality` 类型需要支持 GPT Image 的 `high`, `medium`, `low`
- 添加 `background` 字段用于 GPT Image 透明背景

### 2. 常量定义

在 `app/shared/constants.ts` 添加：

```typescript
// 支持尺寸参数的模型
export const MODELS_WITH_SIZE: ImageModelType[] = ['dalle', 'doubao', 'gpt4o-image']

// 支持 quality 参数的模型
export const MODELS_WITH_QUALITY: ImageModelType[] = ['dalle', 'gpt4o-image']

// 支持 style 参数的模型
export const MODELS_WITH_STYLE: ImageModelType[] = ['dalle']

// 支持 seed 参数的模型
export const MODELS_WITH_SEED: ImageModelType[] = ['doubao']

// 支持 guidanceScale 参数的模型
export const MODELS_WITH_GUIDANCE: ImageModelType[] = ['doubao']

// 支持 watermark 参数的模型
export const MODELS_WITH_WATERMARK: ImageModelType[] = ['doubao']

// 支持 aspectRatio 参数的模型
export const MODELS_WITH_ASPECT_RATIO: ImageModelType[] = ['flux']

// 支持 background 参数的模型
export const MODELS_WITH_BACKGROUND: ImageModelType[] = ['gpt4o-image']
```

### 3. ImageForm.vue 改造

参考 `VideoForm.vue` 的模式：

```vue
<script setup lang="ts">
// 模型类型判断
const isDalleModel = computed(() => selectedAimodel.value?.modelType === 'dalle')
const isDoubaoModel = computed(() => selectedAimodel.value?.modelType === 'doubao')
const isFluxModel = computed(() => selectedAimodel.value?.modelType === 'flux')
const isGpt4oImageModel = computed(() => selectedAimodel.value?.modelType === 'gpt4o-image')

// 参数状态
const size = ref('1024x1024')
const quality = ref<'standard' | 'hd' | 'high' | 'medium' | 'low'>('standard')
const style = ref<'vivid' | 'natural'>('vivid')
const seed = ref(-1)
const guidanceScale = ref(2.5)
const watermark = ref(true)
const aspectRatio = ref('1:1')
const background = ref<'auto' | 'transparent' | 'opaque'>('auto')

// 选项定义
const dalleSizeOptions = [
  { label: '1024x1024 (方形)', value: '1024x1024' },
  { label: '1792x1024 (横版)', value: '1792x1024' },
  { label: '1024x1792 (竖版)', value: '1024x1792' },
]

const doubaoSizeOptions = [
  { label: '1024x1024 (1:1)', value: '1024x1024' },
  { label: '1152x864 (4:3)', value: '1152x864' },
  { label: '864x1152 (3:4)', value: '864x1152' },
  { label: '1280x720 (16:9)', value: '1280x720' },
  { label: '720x1280 (9:16)', value: '720x1280' },
  { label: '1248x832 (3:2)', value: '1248x832' },
  { label: '832x1248 (2:3)', value: '832x1248' },
]

const gptImageSizeOptions = [
  { label: '1024x1024 (方形)', value: '1024x1024' },
  { label: '1536x1024 (横版)', value: '1536x1024' },
  { label: '1024x1536 (竖版)', value: '1024x1536' },
  { label: '自动', value: 'auto' },
]

const qualityOptions = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
]

const gptImageQualityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
]

const styleOptions = [
  { label: '生动 (超现实)', value: 'vivid' },
  { label: '自然', value: 'natural' },
]

const fluxAspectRatioOptions = [
  { label: '1:1 (方形)', value: '1:1' },
  { label: '16:9 (横屏)', value: '16:9' },
  { label: '9:16 (竖屏)', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '21:9 (超宽)', value: '21:9' },
]

const backgroundOptions = [
  { label: '自动', value: 'auto' },
  { label: '透明', value: 'transparent' },
  { label: '不透明', value: 'opaque' },
]
</script>

<template>
  <!-- DALL-E 3 参数 -->
  <template v-if="isDalleModel">
    <UFormField label="尺寸" class="mb-4">
      <USelect v-model="size" :items="dalleSizeOptions" />
    </UFormField>
    <UFormField label="质量" class="mb-4">
      <USelect v-model="quality" :items="qualityOptions" />
    </UFormField>
    <UFormField label="风格" class="mb-4">
      <USelect v-model="style" :items="styleOptions" />
    </UFormField>
  </template>

  <!-- 豆包参数 -->
  <template v-if="isDoubaoModel">
    <UFormField label="尺寸" class="mb-4">
      <USelect v-model="size" :items="doubaoSizeOptions" />
    </UFormField>
    <UFormField label="提示词相关度" class="mb-4">
      <template #hint>
        <span class="text-(--ui-text-dimmed) text-xs">值越大与提示词相关性越强 (1-10)</span>
      </template>
      <UInput v-model.number="guidanceScale" type="number" :min="1" :max="10" :step="0.5" />
    </UFormField>
    <UFormField label="随机种子" class="mb-4">
      <template #hint>
        <span class="text-(--ui-text-dimmed) text-xs">-1 表示自动生成</span>
      </template>
      <UInput v-model.number="seed" type="number" :min="-1" :max="2147483647" />
    </UFormField>
    <div class="flex items-center justify-between mb-4">
      <div class="flex flex-col">
        <span class="text-sm text-(--ui-text)">添加水印</span>
        <span class="text-xs text-(--ui-text-dimmed)">在图片右下角添加"AI生成"水印</span>
      </div>
      <USwitch v-model="watermark" />
    </div>
  </template>

  <!-- Flux 参数 -->
  <template v-if="isFluxModel">
    <UFormField label="宽高比" class="mb-4">
      <USelect v-model="aspectRatio" :items="fluxAspectRatioOptions" />
    </UFormField>
  </template>

  <!-- GPT-4o Image 参数 -->
  <template v-if="isGpt4oImageModel">
    <UFormField label="尺寸" class="mb-4">
      <USelect v-model="size" :items="gptImageSizeOptions" />
    </UFormField>
    <UFormField label="质量" class="mb-4">
      <USelect v-model="quality" :items="gptImageQualityOptions" />
    </UFormField>
    <UFormField label="背景" class="mb-4">
      <USelect v-model="background" :items="backgroundOptions" />
    </UFormField>
  </template>
</template>
```

### 4. 后端服务改造

`server/services/dalle.ts` 需要支持新增参数：

```typescript
// 文生图
async function generateImage(prompt: string, modelName: string, taskId?: number, signal?: AbortSignal, modelParams?: ImageModelParams): Promise<GenerateResult> {
  const body: Record<string, any> = {
    model: modelName,
    prompt,
    n: modelParams?.n || 1,
    response_format: 'url',
  }

  // size 参数（根据模型不同有不同处理）
  if (modelParams?.size) {
    body.size = modelParams.size
  } else if (!isDoubaoModel(modelName)) {
    body.size = '1024x1024'
  }

  // DALL-E 3 专属参数
  if (modelName.includes('dall-e-3')) {
    if (modelParams?.quality) body.quality = modelParams.quality
    if (modelParams?.style) body.style = modelParams.style
  }

  // 豆包专属参数
  if (isDoubaoModel(modelName)) {
    if (modelParams?.seed !== undefined && modelParams.seed !== -1) {
      body.seed = modelParams.seed
    }
    if (modelParams?.guidanceScale) body.guidance_scale = modelParams.guidanceScale
    if (modelParams?.watermark !== undefined) body.watermark = modelParams.watermark
  }

  // Flux 专属参数
  if (isFluxModel(modelName)) {
    if (modelParams?.aspectRatio) body.aspect_ratio = modelParams.aspectRatio
    if (modelParams?.negativePrompt) body.negative_prompt = modelParams.negativePrompt
  }

  // GPT Image 专属参数
  if (modelName.includes('gpt-image')) {
    if (modelParams?.quality) body.quality = modelParams.quality
    if (modelParams?.background) body.background = modelParams.background
  }

  // ... 发送请求
}
```

### 5. setContent 方法更新

支持从任务恢复时填充参数：

```typescript
function setContent(newPrompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  prompt.value = newPrompt || ''
  negativePrompt.value = modelParams?.negativePrompt || ''
  referenceImages.value = images.slice(0, MAX_REFERENCE_IMAGE_COUNT)

  // 恢复模型参数
  if (modelParams) {
    if (modelParams.size) size.value = modelParams.size
    if (modelParams.quality) quality.value = modelParams.quality
    if (modelParams.style) style.value = modelParams.style
    if (modelParams.seed !== undefined) seed.value = modelParams.seed
    if (modelParams.guidanceScale) guidanceScale.value = modelParams.guidanceScale
    if (modelParams.watermark !== undefined) watermark.value = modelParams.watermark
    if (modelParams.aspectRatio) aspectRatio.value = modelParams.aspectRatio
    if (modelParams.background) background.value = modelParams.background
  }
}
```

## 实施步骤

1. **更新类型定义**：扩展 `ImageModelParams` 添加 `background` 字段，扩展 `quality` 类型
2. **添加常量**：在 `constants.ts` 添加各参数支持的模型列表
3. **改造 ImageForm.vue**：
   - 添加模型类型判断计算属性
   - 添加参数状态变量
   - 添加选项定义
   - 添加模板中的参数控件
   - 更新 `handleSubmit` 构建 modelParams
   - 更新 `setContent` 支持参数恢复
4. **改造 dalle.ts**：支持新参数发送到上游
5. **测试各模型**：验证参数正确传递和效果

## 注意事项

- 保持与 VideoForm.vue 一致的 UI 风格
- 参数控件按模型类型条件渲染
- 默认值需与 API 文档保持一致
- 复用面板功能需要正确恢复参数

<script setup lang="ts">
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { ImageModelType, ApiFormat, ImageModelParams } from '../../shared/types'
import {
  API_FORMAT_LABELS,
  MODELS_WITHOUT_REFERENCE_IMAGE,
  MODELS_WITH_NEGATIVE_PROMPT,
  MODELS_WITH_SIZE,
  MODELS_WITH_QUALITY,
  MODELS_WITH_STYLE,
  MODELS_WITH_ASPECT_RATIO,
  MODELS_WITH_SEED,
  MODELS_WITH_GUIDANCE,
  MODELS_WITH_WATERMARK,
  MODELS_WITH_BACKGROUND,
  MAX_REFERENCE_IMAGE_SIZE_BYTES,
  MAX_REFERENCE_IMAGE_COUNT,
  USER_SETTING_KEYS,
} from '../../shared/constants'

const props = defineProps<{
  upstreams: Upstream[]
}>()

const emit = defineEmits<{
  submit: [data: {
    prompt: string
    images: string[]
    upstreamId: number
    aimodelId: number
    modelType: ImageModelType
    apiFormat: ApiFormat
    modelName: string
    modelParams: ImageModelParams
  }]
}>()

const toast = useToast()
const { getAuthHeader } = useAuth()
const { settings, isLoaded: settingsLoaded, loadSettings } = useUserSettings()

const prompt = ref('')
const negativePrompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedAimodelId = ref<number | null>(null)

// 从 selectedAimodelId 计算 selectedUpstreamId
const selectedUpstreamId = computed(() => {
  if (!selectedAimodelId.value) return null

  for (const upstream of props.upstreams) {
    if (upstream.aimodels?.some(m => m.id === selectedAimodelId.value)) {
      return upstream.id
    }
  }
  return null
})

// 模型参数状态
const size = ref('1024x1024')
const quality = ref<'standard' | 'hd' | 'high' | 'medium' | 'low'>('standard')
const style = ref<'vivid' | 'natural'>('vivid')
const aspectRatio = ref('1:1')
const seed = ref(-1)
const guidanceScale = ref(2.5)
const watermark = ref(true)
const background = ref<'auto' | 'transparent' | 'opaque'>('auto')

// 尺寸选项
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
  { label: '自动', value: 'auto' },
  { label: '1024x1024 (方形)', value: '1024x1024' },
  { label: '1536x1024 (横版)', value: '1536x1024' },
  { label: '1024x1536 (竖版)', value: '1024x1536' },
]

// 质量选项
const dalleQualityOptions = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
]

const gptImageQualityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
]

// 风格选项
const styleOptions = [
  { label: '生动 (超现实)', value: 'vivid' },
  { label: '自然', value: 'natural' },
]

// 宽高比选项 (Flux)
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

// 背景选项 (GPT Image)
const backgroundOptions = [
  { label: '自动', value: 'auto' },
  { label: '透明', value: 'transparent' },
  { label: '不透明', value: 'opaque' },
]

// AI 优化状态
const isOptimizing = ref(false)

// 加载用户设置
onMounted(async () => {
  if (!settingsLoaded.value) {
    await loadSettings()
  }
})

// 监听用户设置加载完成，设置工作台默认模型
watch(settingsLoaded, (loaded) => {
  if (loaded && !selectedUpstreamId.value && !selectedAimodelId.value) {
    const workbenchUpstreamId = settings.value[USER_SETTING_KEYS.DRAWING_WORKBENCH_UPSTREAM_ID]
    const workbenchAimodelId = settings.value[USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID]
    if (workbenchUpstreamId && workbenchAimodelId) {
      selectedUpstreamId.value = workbenchUpstreamId as number
      selectedAimodelId.value = workbenchAimodelId as number
    }
  }
}, { immediate: true })

// AI 优化配置是否已设置
const hasAiOptimizeConfig = computed(() => {
  const upstreamId = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_UPSTREAM_ID]
  const aimodelId = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID]
  return upstreamId && aimodelId
})

// AI 优化提示词
async function handleOptimize() {
  if (!prompt.value.trim()) {
    toast.add({ title: '请先输入提示词', color: 'warning' })
    return
  }

  if (!hasAiOptimizeConfig.value) {
    toast.add({ title: '请先在设置中配置 AI 优化模型', color: 'warning' })
    return
  }

  isOptimizing.value = true
  try {
    const result = await $fetch<{ success: boolean; optimizedPrompt: string; negativePrompt?: string }>('/api/prompts/optimize', {
      method: 'POST',
      headers: getAuthHeader(),
      body: {
        prompt: prompt.value,
        upstreamId: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_UPSTREAM_ID],
        aimodelId: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID],
        modelName: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_MODEL_NAME],
        targetModelType: selectedAimodel.value?.modelType,
        targetModelName: selectedAimodel.value?.modelName,
      },
    })

    if (result.success && result.optimizedPrompt) {
      prompt.value = result.optimizedPrompt
      // 如果返回了负面提示词且当前模型支持，则填充
      if (result.negativePrompt && supportsNegativePrompt.value) {
        negativePrompt.value = result.negativePrompt
        toast.add({ title: '提示词已优化', description: '已填充负面提示词', color: 'success' })
      } else {
        toast.add({ title: '提示词已优化', color: 'success' })
      }
    }
  } catch (error: any) {
    toast.add({ title: '优化失败', description: error.data?.message || error.message, color: 'error' })
  } finally {
    isOptimizing.value = false
  }
}

// 模型选择器引用
const modelSelectorRef = ref<{
  selectedUpstream: Upstream | undefined
  selectedAimodel: Aimodel | undefined
} | null>(null)

// 选中的 AI 模型（从 ModelSelector 获取）
const selectedAimodel = computed((): Aimodel | undefined => {
  return modelSelectorRef.value?.selectedAimodel
})

// 是否支持垫图（部分模型不支持）
const supportsReferenceImages = computed(() => {
  if (!selectedAimodel.value?.apiFormat) return false
  if (MODELS_WITHOUT_REFERENCE_IMAGE.includes(selectedAimodel.value.modelType as ImageModelType)) return false
  return true
})

// 是否支持负面提示词
const supportsNegativePrompt = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_NEGATIVE_PROMPT.includes(selectedAimodel.value.modelType as ImageModelType)
})

// 模型类型判断
const isDalleModel = computed(() => selectedAimodel.value?.modelType === 'dalle')
const isDoubaoModel = computed(() => selectedAimodel.value?.modelType === 'doubao')
const isFluxModel = computed(() => selectedAimodel.value?.modelType === 'flux')
const isGpt4oImageModel = computed(() => selectedAimodel.value?.modelType === 'gpt4o-image')

// 是否支持各参数
const supportsSize = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_SIZE.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsQuality = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_QUALITY.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsStyle = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_STYLE.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsAspectRatio = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_ASPECT_RATIO.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsSeed = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_SEED.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsGuidance = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_GUIDANCE.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsWatermark = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_WATERMARK.includes(selectedAimodel.value.modelType as ImageModelType)
})

const supportsBackground = computed(() => {
  if (!selectedAimodel.value) return false
  return MODELS_WITH_BACKGROUND.includes(selectedAimodel.value.modelType as ImageModelType)
})

// 获取当前模型的尺寸选项
const currentSizeOptions = computed(() => {
  if (isDalleModel.value) return dalleSizeOptions
  if (isDoubaoModel.value) return doubaoSizeOptions
  if (isGpt4oImageModel.value) return gptImageSizeOptions
  return dalleSizeOptions
})

// 获取当前模型的质量选项
const currentQualityOptions = computed(() => {
  if (isGpt4oImageModel.value) return gptImageQualityOptions
  return dalleQualityOptions
})

// 高级选项数量
const advancedOptionsCount = computed(() => {
  let count = 0
  if (supportsNegativePrompt.value) count++
  if (supportsSize.value) count++
  if (supportsQuality.value) count++
  if (supportsStyle.value) count++
  if (supportsAspectRatio.value) count++
  if (supportsSeed.value) count++
  if (supportsGuidance.value) count++
  if (supportsWatermark.value) count++
  if (supportsBackground.value) count++
  return count
})

// 模型信息模态框状态
const showModelInfoModal = ref(false)

// 上传中状态
const isUploading = ref(false)

// 处理图片上传
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const files = Array.from(input.files).slice(0, MAX_REFERENCE_IMAGE_COUNT - referenceImages.value.length)

  for (const file of files) {
    if (file.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
      toast.add({ title: '图片大小不能超过10MB', color: 'error' })
      continue
    }

    // 上传到服务器
    isUploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await $fetch<{ success: boolean; url: string }>('/api/images/upload', {
        method: 'POST',
        body: formData,
      })

      if (result.success && referenceImages.value.length < MAX_REFERENCE_IMAGE_COUNT) {
        referenceImages.value.push(result.url)
      }
    } catch (error: any) {
      toast.add({ title: '图片上传失败', description: error.message, color: 'error' })
    } finally {
      isUploading.value = false
    }
  }

  input.value = ''
}

// 移除参考图
function removeImage(index: number) {
  referenceImages.value.splice(index, 1)
}

// 提交生成
async function handleSubmit() {
  if (!prompt.value.trim() && referenceImages.value.length === 0) {
    return
  }

  if (!selectedUpstreamId.value || selectedAimodelId.value === null || !selectedAimodel.value) {
    toast.add({ title: '请先选择模型配置', color: 'warning' })
    return
  }

  if (!supportsReferenceImages.value && referenceImages.value.length > 0 && !prompt.value.trim()) {
    toast.add({ title: '当前模型需要输入提示词', color: 'warning' })
    return
  }

  isSubmitting.value = true
  try {
    const imagesToSubmit = supportsReferenceImages.value ? referenceImages.value : []

    // 构建 modelParams
    const modelParams: ImageModelParams = {}

    // 负面提示词
    if (supportsNegativePrompt.value && negativePrompt.value) {
      modelParams.negativePrompt = negativePrompt.value
    }

    // 尺寸
    if (supportsSize.value && size.value) {
      modelParams.size = size.value
    }

    // 质量
    if (supportsQuality.value && quality.value) {
      modelParams.quality = quality.value
    }

    // 风格 (DALL-E 3)
    if (supportsStyle.value && style.value) {
      modelParams.style = style.value
    }

    // 宽高比 (Flux)
    if (supportsAspectRatio.value && aspectRatio.value) {
      modelParams.aspectRatio = aspectRatio.value
    }

    // 随机种子 (豆包)
    if (supportsSeed.value && seed.value !== -1) {
      modelParams.seed = seed.value
    }

    // 提示词相关度 (豆包)
    if (supportsGuidance.value) {
      modelParams.guidanceScale = guidanceScale.value
    }

    // 水印 (豆包)
    if (supportsWatermark.value) {
      modelParams.watermark = watermark.value
    }

    // 背景透明度 (GPT Image)
    if (supportsBackground.value && background.value !== 'auto') {
      modelParams.background = background.value
    }

    emit('submit', {
      prompt: prompt.value,
      images: imagesToSubmit,
      upstreamId: selectedUpstreamId.value,
      aimodelId: selectedAimodelId.value,
      modelType: selectedAimodel.value.modelType as ImageModelType,
      apiFormat: selectedAimodel.value.apiFormat,
      modelName: selectedAimodel.value.modelName,
      modelParams,
    })
  } finally {
    isSubmitting.value = false
  }
}

// 设置面板内容（供外部调用）
function setContent(newPrompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  prompt.value = newPrompt || ''
  negativePrompt.value = modelParams?.negativePrompt || ''
  referenceImages.value = images.slice(0, MAX_REFERENCE_IMAGE_COUNT)

  // 恢复模型参数
  if (modelParams) {
    if (modelParams.size) size.value = modelParams.size
    if (modelParams.quality) quality.value = modelParams.quality
    if (modelParams.style) style.value = modelParams.style
    if (modelParams.aspectRatio) aspectRatio.value = modelParams.aspectRatio
    if (modelParams.seed !== undefined) seed.value = modelParams.seed
    if (modelParams.guidanceScale !== undefined) guidanceScale.value = modelParams.guidanceScale
    if (modelParams.watermark !== undefined) watermark.value = modelParams.watermark
    if (modelParams.background) background.value = modelParams.background
  }
}

// 暴露给父组件
defineExpose({
  setContent,
})
</script>

<template>
  <div class="space-y-4">
    <!-- 模型选择 -->
    <UFormField label="选择模型">
        <template #label>
          <span class="inline-flex items-center gap-1.5">
            选择模型
            <button
              v-if="selectedAimodel"
              type="button"
              class="inline-flex items-center text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
              @click="showModelInfoModal = true"
            >
              <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5" />
            </button>
          </span>
        </template>
        <ModelSelector
          ref="modelSelectorRef"
          :upstreams="upstreams"
          category="image"
          v-model:aimodel-id="selectedAimodelId"
        />
      </UFormField>

    <!-- 模型信息模态框 -->
    <UModal v-model:open="showModelInfoModal" title="模型信息">
      <template #body>
        <div v-if="selectedAimodel" class="space-y-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-(--ui-text-muted)">请求格式：</span>
            <span class="text-(--ui-text)">{{ API_FORMAT_LABELS[selectedAimodel.apiFormat] || selectedAimodel.apiFormat }}</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-(--ui-text-muted)">模型名称：</span>
            <span class="text-(--ui-text) font-mono">{{ selectedAimodel.modelName }}</span>
          </div>
        </div>
        <p v-else class="text-(--ui-text-muted) text-sm">请先选择一个模型</p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="showModelInfoModal = false">关闭</UButton>
      </template>
    </UModal>

    <!-- 分隔线 -->
    <div class="border-t border-(--ui-border)" />

    <!-- 参考图上传区 -->
    <UFormField v-if="supportsReferenceImages" label="参考图 (可选)">
      <template #hint>
        <span class="text-(--ui-text-dimmed) text-xs">支持 JPG、PNG，单张最大10MB</span>
      </template>

      <div class="flex gap-3 flex-wrap">
        <!-- 已上传的图片 -->
        <div
          v-for="(img, index) in referenceImages"
          :key="index"
          class="relative w-24 h-24 rounded-lg overflow-hidden group"
        >
          <img :src="img" class="w-full h-full object-cover" />
          <button
            type="button"
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            @click="removeImage(index)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
          </button>
        </div>

        <!-- 上传按钮 -->
        <label
          v-if="referenceImages.length < MAX_REFERENCE_IMAGE_COUNT"
          class="w-24 h-24 rounded-lg border-2 border-dashed border-(--ui-border-accented) hover:border-(--ui-primary) transition-colors flex flex-col items-center justify-center cursor-pointer"
        >
          <UIcon name="i-heroicons-cloud-arrow-up" class="w-8 h-8 text-(--ui-text-dimmed) mb-1" />
          <span class="text-(--ui-text-dimmed) text-xs">上传</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            class="hidden"
            @change="handleFileChange"
          />
        </label>
      </div>
    </UFormField>

    <!-- 提示词输入 -->
    <UFormField label="描述你想要的图片">
      <template #label>
        <span class="inline-flex items-center gap-2">
          描述你想要的图片
          <UButton
            size="xs"
            variant="soft"
            :loading="isOptimizing"
            :disabled="!prompt.trim() || !hasAiOptimizeConfig"
            @click="handleOptimize"
          >
            <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mr-1" />
            AI 优化
          </UButton>
        </span>
      </template>
      <UTextarea
        v-model="prompt"
        placeholder="例如：一只可爱的小猫咪坐在花园里，油画风格，高清，细节丰富"
        :rows="8"
        class="w-full"
      />
    </UFormField>

    <!-- 高级选项折叠区域 -->
    <UCollapsible v-if="selectedAimodel">
      <UButton variant="ghost" block class="justify-between" :ui="{ trailingIconLeadingClass: 'ms-auto' }">
        <span class="text-sm text-(--ui-text-muted)">
          高级选项
          <span v-if="advancedOptionsCount > 0" class="ml-1 text-(--ui-primary)">+{{ advancedOptionsCount }}</span>
        </span>
        <template #trailing>
          <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
        </template>
      </UButton>
      <template #content>
        <div class="pt-4 space-y-4">
          <!-- 无高级选项提示 -->
          <div v-if="advancedOptionsCount === 0" class="text-center py-4 text-(--ui-text-muted) text-sm">
            该模型没有高级选项
          </div>

          <!-- 负面提示词输入（仅支持的模型显示） -->
          <UFormField v-if="supportsNegativePrompt" label="负面提示词">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">描述不希望出现的内容</span>
            </template>
            <UTextarea
              v-model="negativePrompt"
              placeholder="例如：模糊、低质量、变形、水印"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <!-- 尺寸选择 -->
          <UFormField v-if="supportsSize" label="尺寸">
            <USelect
              v-model="size"
              :items="currentSizeOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 宽高比选择 (Flux) -->
          <UFormField v-if="supportsAspectRatio" label="宽高比">
            <USelect
              v-model="aspectRatio"
              :items="fluxAspectRatioOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 质量选择 -->
          <UFormField v-if="supportsQuality" label="质量">
            <USelect
              v-model="quality"
              :items="currentQualityOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 风格选择 (DALL-E 3) -->
          <UFormField v-if="supportsStyle" label="风格">
            <USelect
              v-model="style"
              :items="styleOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 背景透明度 (GPT Image) -->
          <UFormField v-if="supportsBackground" label="背景">
            <USelect
              v-model="background"
              :items="backgroundOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 提示词相关度 (豆包) -->
          <UFormField v-if="supportsGuidance" label="提示词相关度">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">值越大与提示词相关性越强 (1-10)</span>
            </template>
            <UInput
              v-model.number="guidanceScale"
              type="number"
              :min="1"
              :max="10"
              :step="0.5"
              class="w-full"
            />
          </UFormField>

          <!-- 随机种子 (豆包) -->
          <UFormField v-if="supportsSeed" label="随机种子">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">-1 表示自动生成</span>
            </template>
            <UInput
              v-model.number="seed"
              type="number"
              :min="-1"
              :max="2147483647"
              class="w-full"
            />
          </UFormField>

          <!-- 水印开关 (豆包) -->
          <div v-if="supportsWatermark" class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm text-(--ui-text)">添加水印</span>
              <span class="text-xs text-(--ui-text-dimmed)">在图片右下角添加"AI生成"水印</span>
            </div>
            <USwitch v-model="watermark" />
          </div>
        </div>
      </template>
    </UCollapsible>

    <!-- 提交按钮 -->
    <UButton
      block
      size="lg"
      :loading="isSubmitting"
      :disabled="(!prompt.trim() && referenceImages.length === 0) || selectedAimodelId === null || upstreams.length === 0"
      class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>

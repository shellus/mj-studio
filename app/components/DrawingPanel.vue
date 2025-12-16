<script setup lang="ts">
import type { ModelConfig } from '~/composables/useTasks'

type ModelType = 'midjourney' | 'gemini' | 'flux' | 'dalle' | 'doubao' | 'gpt4o-image' | 'grok-image' | 'qwen-image'
type ApiFormat = 'mj-proxy' | 'gemini' | 'dalle' | 'openai-chat'

interface ModelTypeConfig {
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  estimatedTime: number
}

// 模型类型显示名称
const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  'midjourney': 'Midjourney',
  'gemini': 'Gemini',
  'flux': 'Flux',
  'dalle': 'DALL-E',
  'doubao': '豆包',
  'gpt4o-image': 'GPT-4o Image',
  'grok-image': 'Grok Image',
  'qwen-image': '通义万相',
}

// 模型类型图标
const MODEL_TYPE_ICONS: Record<ModelType, string> = {
  'midjourney': 'i-heroicons-sparkles',
  'gemini': 'i-heroicons-cpu-chip',
  'flux': 'i-heroicons-bolt',
  'dalle': 'i-heroicons-photo',
  'doubao': 'i-heroicons-fire',
  'gpt4o-image': 'i-heroicons-chat-bubble-left-right',
  'grok-image': 'i-heroicons-rocket-launch',
  'qwen-image': 'i-heroicons-cloud',
}

// 模型使用提示
const MODEL_TYPE_HINTS: Partial<Record<ModelType, string>> = {
  'dalle': 'DALL-E 3 API 不支持垫图功能',
  'grok-image': '提示词需包含明确的生成指令，如"为我生成图片：<描述>"',
}

// 不支持垫图的模型
const MODELS_WITHOUT_REF_IMAGE: ModelType[] = ['dalle']

const props = defineProps<{
  modelConfigs: ModelConfig[]
}>()

const emit = defineEmits<{
  submit: [prompt: string, images: string[], modelConfigId: number, modelType: ModelType, apiFormat: ApiFormat, modelName: string]
}>()

const prompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedConfigId = ref<number | null>(null)
const selectedModelName = ref<string | null>(null)  // 用 modelName 唯一标识选中的模型

// 选中的模型配置
const selectedConfig = computed(() => {
  return props.modelConfigs.find(c => c.id === selectedConfigId.value)
})

// 选中的模型类型配置（通过 modelName 查找）
const selectedModelTypeConfig = computed((): ModelTypeConfig | undefined => {
  if (!selectedConfig.value || selectedModelName.value === null) return undefined
  return selectedConfig.value.modelTypeConfigs?.find(
    (mtc: ModelTypeConfig) => mtc.modelName === selectedModelName.value
  )
})

// 当前配置支持的模型类型列表
const availableModelTypes = computed((): ModelTypeConfig[] => {
  if (!selectedConfig.value?.modelTypeConfigs) return []
  return selectedConfig.value.modelTypeConfigs
})

// 是否支持垫图（部分模型不支持）
const supportsReferenceImages = computed(() => {
  if (!selectedModelTypeConfig.value?.apiFormat) return false
  // DALL-E 3 不支持垫图
  if (MODELS_WITHOUT_REF_IMAGE.includes(selectedModelTypeConfig.value.modelType)) return false
  return true
})

// 当前模型的使用提示
const currentModelHint = computed(() => {
  if (!selectedModelTypeConfig.value) return undefined
  return MODEL_TYPE_HINTS[selectedModelTypeConfig.value.modelType]
})

// 当配置列表变化时，选择默认配置
watch(() => props.modelConfigs, (configs) => {
  if (configs.length > 0 && !selectedConfigId.value) {
    const defaultConfig = configs.find(c => c.isDefault) || configs[0]
    selectedConfigId.value = defaultConfig.id
    // 默认选择第一个支持的模型
    if (defaultConfig.modelTypeConfigs && defaultConfig.modelTypeConfigs.length > 0) {
      selectedModelName.value = defaultConfig.modelTypeConfigs[0].modelName
    }
  }
}, { immediate: true })

// 当配置变化时，更新模型选择
watch(selectedConfigId, (newId) => {
  const config = props.modelConfigs.find(c => c.id === newId)
  if (config?.modelTypeConfigs && config.modelTypeConfigs.length > 0) {
    // 如果当前选择的模型不在新配置支持的列表中，切换到第一个
    const supportedNames = config.modelTypeConfigs.map((mtc: ModelTypeConfig) => mtc.modelName)
    if (!selectedModelName.value || !supportedNames.includes(selectedModelName.value)) {
      selectedModelName.value = config.modelTypeConfigs[0].modelName
    }
  }
})

// 处理图片上传
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const files = Array.from(input.files).slice(0, 3) // 最多3张

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过10MB')
      continue
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      if (referenceImages.value.length < 3) {
        referenceImages.value.push(base64)
      }
    }
    reader.readAsDataURL(file)
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

  if (!selectedConfigId.value || selectedModelName.value === null || !selectedModelTypeConfig.value) {
    alert('请先选择模型配置')
    return
  }

  // 非MJ模式下，不支持纯参考图
  if (!supportsReferenceImages.value && referenceImages.value.length > 0 && !prompt.value.trim()) {
    alert('当前模型需要输入提示词')
    return
  }

  isSubmitting.value = true
  try {
    // 如果模型不支持垫图，不传递图片数据
    const imagesToSubmit = supportsReferenceImages.value ? referenceImages.value : []
    emit(
      'submit',
      prompt.value,
      imagesToSubmit,
      selectedConfigId.value,
      selectedModelTypeConfig.value.modelType,
      selectedModelTypeConfig.value.apiFormat,
      selectedModelTypeConfig.value.modelName
    )
  } finally {
    isSubmitting.value = false
  }
}

// 提示词模板
const templates = [
  { label: '写实风格', value: 'realistic, 8k, detailed, professional photography' },
  { label: '动漫风格', value: 'anime style, studio ghibli, vibrant colors' },
  { label: '油画风格', value: 'oil painting, impressionism, artistic' },
  { label: '赛博朋克', value: 'cyberpunk, neon lights, futuristic, dark' },
]

function applyTemplate(template: string) {
  if (prompt.value) {
    prompt.value += ', ' + template
  } else {
    prompt.value = template
  }
}
</script>

<template>
  <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-2xl p-6 border border-(--ui-border)">
    <!-- 上游选择 -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-(--ui-text-toned) text-sm font-medium">选择上游</h3>
        <NuxtLink to="/settings" class="text-(--ui-primary) text-xs hover:opacity-80">
          管理配置
        </NuxtLink>
      </div>

      <div v-if="modelConfigs.length === 0" class="p-4 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) text-center">
        <p class="text-(--ui-text-muted) text-sm mb-3">还没有模型配置</p>
        <NuxtLink to="/settings">
          <UButton size="sm">添加配置</UButton>
        </NuxtLink>
      </div>

      <div v-else class="relative">
        <UIcon name="i-heroicons-server" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--ui-text-dimmed) pointer-events-none" />
        <select
          v-model="selectedConfigId"
          class="w-full pl-10 pr-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) text-(--ui-text) focus:outline-none focus:border-(--ui-primary) appearance-none cursor-pointer"
        >
          <option v-for="config in modelConfigs" :key="config.id" :value="config.id">
            {{ config.name }}
          </option>
        </select>
        <UIcon name="i-heroicons-chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--ui-text-dimmed) pointer-events-none" />
      </div>
    </div>

    <!-- 模型类型选择（当上游支持多个类型时显示） -->
    <div v-if="availableModelTypes.length > 1" class="mb-4">
      <h3 class="text-(--ui-text-toned) text-sm font-medium mb-3">选择模型</h3>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="mtc in availableModelTypes"
          :key="mtc.modelName"
          :class="[
            'p-2 rounded-lg border transition-all text-center flex items-center justify-center gap-2',
            selectedModelName === mtc.modelName
              ? 'border-(--ui-primary) bg-(--ui-primary)/10'
              : 'border-(--ui-border-accented) hover:border-(--ui-text-dimmed)'
          ]"
          @click="selectedModelName = mtc.modelName"
        >
          <UIcon
            :name="MODEL_TYPE_ICONS[mtc.modelType] || 'i-heroicons-sparkles'"
            :class="['w-4 h-4', selectedModelName === mtc.modelName ? 'text-(--ui-primary)' : 'text-(--ui-text-dimmed)']"
          />
          <span :class="['text-sm', selectedModelName === mtc.modelName ? 'text-(--ui-text-highlighted)' : 'text-(--ui-text-muted)']">
            {{ MODEL_TYPE_LABELS[mtc.modelType] || mtc.modelType }}
          </span>
        </button>
      </div>
    </div>

    <!-- 模型使用提示 -->
    <div v-if="currentModelHint" class="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p class="text-sm text-amber-600 dark:text-amber-400">{{ currentModelHint }}</p>
      </div>
    </div>

    <!-- 参考图上传区 (仅MJ-Proxy格式支持) -->
    <div v-if="supportsReferenceImages" class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-(--ui-text-toned) text-sm font-medium">参考图 (可选，最多3张)</h3>
        <span class="text-(--ui-text-dimmed) text-xs">支持 JPG、PNG，单张最大10MB</span>
      </div>

      <div class="flex gap-3 flex-wrap">
        <!-- 已上传的图片 -->
        <div
          v-for="(img, index) in referenceImages"
          :key="index"
          class="relative w-24 h-24 rounded-lg overflow-hidden group"
        >
          <img :src="img" class="w-full h-full object-cover" />
          <button
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            @click="removeImage(index)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
          </button>
        </div>

        <!-- 上传按钮 -->
        <label
          v-if="referenceImages.length < 3"
          class="w-24 h-24 rounded-lg border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) transition-colors flex flex-col items-center justify-center cursor-pointer"
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
    </div>

    <!-- 提示词输入 -->
    <div class="mb-4">
      <div class="mb-3">
        <h3 class="text-(--ui-text-toned) text-sm font-medium mb-2">描述你想要的图片</h3>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="tpl in templates"
            :key="tpl.label"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="applyTemplate(tpl.value)"
          >
            {{ tpl.label }}
          </UButton>
        </div>
      </div>

      <UTextarea
        v-model="prompt"
        placeholder="例如：一只可爱的小猫咪坐在花园里，油画风格，高清，细节丰富"
        :rows="4"
        class="w-full"
      />
    </div>

    <!-- 提交按钮 -->
    <UButton
      block
      size="lg"
      :loading="isSubmitting"
      :disabled="(!prompt.trim() && referenceImages.length === 0) || !selectedConfigId || selectedModelName === null || modelConfigs.length === 0"
      class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>

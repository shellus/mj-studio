<script setup lang="ts">
import type { ModelConfig } from '~/composables/useTasks'

type ModelType = 'midjourney' | 'gemini'

const props = defineProps<{
  modelConfigs: ModelConfig[]
}>()

const emit = defineEmits<{
  submit: [prompt: string, images: string[], modelConfigId: number, modelType: ModelType]
}>()

const prompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedConfigId = ref<number | null>(null)
const selectedModelType = ref<ModelType | null>(null)

// 选中的模型配置
const selectedConfig = computed(() => {
  return props.modelConfigs.find(c => c.id === selectedConfigId.value)
})

// 当配置列表变化时，选择默认配置
watch(() => props.modelConfigs, (configs) => {
  if (configs.length > 0 && !selectedConfigId.value) {
    const defaultConfig = configs.find(c => c.isDefault) || configs[0]
    selectedConfigId.value = defaultConfig.id
    // 默认选择第一个支持的模型类型
    selectedModelType.value = defaultConfig.types[0]
  }
}, { immediate: true })

// 当配置变化时，更新模型类型选择
watch(selectedConfigId, (newId) => {
  const config = props.modelConfigs.find(c => c.id === newId)
  if (config) {
    // 如果当前选择的模型类型不在新配置支持的列表中，切换到第一个
    if (!selectedModelType.value || !config.types.includes(selectedModelType.value)) {
      selectedModelType.value = config.types[0]
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

  if (!selectedConfigId.value || !selectedModelType.value) {
    alert('请先选择模型配置')
    return
  }

  // Gemini不支持纯参考图模式
  if (selectedModelType.value === 'gemini' && referenceImages.value.length > 0 && !prompt.value.trim()) {
    alert('Gemini模型需要输入提示词')
    return
  }

  isSubmitting.value = true
  try {
    emit('submit', prompt.value, referenceImages.value, selectedConfigId.value, selectedModelType.value)
    // 提交后清空参考图，但保留提示词
    referenceImages.value = []
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

      <div v-else class="space-y-2">
        <button
          v-for="config in modelConfigs"
          :key="config.id"
          :class="[
            'w-full p-3 rounded-xl border-2 transition-all text-left',
            selectedConfigId === config.id
              ? 'border-(--ui-primary) bg-(--ui-primary)/10'
              : 'border-(--ui-border) hover:border-(--ui-border-accented) bg-(--ui-bg-muted)'
          ]"
          @click="selectedConfigId = config.id"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-server"
                :class="['w-4 h-4', selectedConfigId === config.id ? 'text-(--ui-primary)' : 'text-(--ui-text-dimmed)']"
              />
              <span :class="['font-medium text-sm', selectedConfigId === config.id ? 'text-(--ui-text-highlighted)' : 'text-(--ui-text-muted)']">
                {{ config.name }}
              </span>
            </div>
            <div class="flex gap-1">
              <span
                v-for="t in config.types"
                :key="t"
                :class="[
                  'px-1.5 py-0.5 rounded text-xs',
                  t === 'midjourney' ? 'bg-(--ui-primary)/20 text-(--ui-primary)' : 'bg-(--ui-secondary)/20 text-(--ui-secondary)'
                ]"
              >
                {{ t === 'midjourney' ? 'MJ' : 'Gemini' }}
              </span>
            </div>
          </div>
          <p v-if="config.remark" class="text-(--ui-text-dimmed) text-xs mt-1 pl-6">{{ config.remark }}</p>
        </button>
      </div>
    </div>

    <!-- 模型类型选择（仅当上游支持多个类型时显示） -->
    <div v-if="selectedConfig && selectedConfig.types.length > 1" class="mb-4">
      <h3 class="text-(--ui-text-toned) text-sm font-medium mb-3">选择模型</h3>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="t in selectedConfig.types"
          :key="t"
          :class="[
            'p-2 rounded-lg border-2 transition-all text-center flex items-center justify-center gap-2',
            selectedModelType === t
              ? 'border-(--ui-primary) bg-(--ui-primary)/10'
              : 'border-(--ui-border) hover:border-(--ui-border-accented) bg-(--ui-bg-muted)'
          ]"
          @click="selectedModelType = t"
        >
          <UIcon
            :name="t === 'midjourney' ? 'i-heroicons-sparkles' : 'i-heroicons-cpu-chip'"
            :class="['w-4 h-4', selectedModelType === t ? 'text-(--ui-primary)' : 'text-(--ui-text-dimmed)']"
          />
          <span :class="['text-sm', selectedModelType === t ? 'text-(--ui-text-highlighted)' : 'text-(--ui-text-muted)']">
            {{ t === 'midjourney' ? 'Midjourney' : 'Gemini' }}
          </span>
        </button>
      </div>
    </div>

    <!-- 参考图上传区 (仅Midjourney支持) -->
    <div v-if="selectedModelType === 'midjourney'" class="mb-6">
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
      :disabled="(!prompt.trim() && referenceImages.length === 0) || !selectedConfigId || !selectedModelType || modelConfigs.length === 0"
      class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>

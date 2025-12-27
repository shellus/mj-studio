<script setup lang="ts">
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { VideoModelType, ApiFormat } from '../../shared/types'
import {
  API_FORMAT_LABELS,
  MAX_REFERENCE_IMAGE_SIZE_BYTES,
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
    modelType: VideoModelType
    apiFormat: ApiFormat
    modelName: string
    videoParams: {
      aspectRatio?: string
      size?: string
      enhancePrompt?: boolean
      enableUpsample?: boolean
      imageMode?: 'reference' | 'frames' | 'components'
    }
  }]
}>()

const toast = useToast()
const { settings, isLoaded: settingsLoaded, loadSettings } = useUserSettings()

const prompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedUpstreamId = ref<number | null>(null)
const selectedAimodelId = ref<number | null>(null)

// 视频参数
const aspectRatio = ref('16:9')
const size = ref('1080P')
const enhancePrompt = ref(true)
const enableUpsample = ref(false)

// 宽高比选项
const aspectRatioOptions = [
  { label: '16:9 (横屏)', value: '16:9' },
  { label: '9:16 (竖屏)', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '1:1 (方形)', value: '1:1' },
  { label: '21:9 (超宽)', value: '21:9' },
]

// 分辨率选项（即梦专用）
const sizeOptions = [
  { label: '1080P', value: '1080P' },
  { label: '1280x720', value: '1280x720' },
  { label: '720x1280', value: '720x1280' },
]

// 加载用户设置
onMounted(async () => {
  if (!settingsLoaded.value) {
    await loadSettings()
  }
})

// 模型选择器引用
const modelSelectorRef = ref<{
  selectedUpstream: Upstream | undefined
  selectedAimodel: Aimodel | undefined
} | null>(null)

// 选中的 AI 模型（从 ModelSelector 获取）
const selectedAimodel = computed((): Aimodel | undefined => {
  return modelSelectorRef.value?.selectedAimodel
})

// 判断是否是即梦模型
const isJimengModel = computed(() => {
  return selectedAimodel.value?.modelType === 'jimeng-video'
})

// 判断是否是 Veo 模型
const isVeoModel = computed(() => {
  return selectedAimodel.value?.modelType === 'veo'
})

// Veo 宽高比选项（只有 16:9 和 9:16）
const veoAspectRatioOptions = aspectRatioOptions.filter(o => ['16:9', '9:16'].includes(o.value))

// 模型信息模态框状态
const showModelInfoModal = ref(false)

// 上传中状态
const isUploading = ref(false)

// 处理图片上传
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const file = input.files[0]

  if (file.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
    toast.add({ title: '图片大小不能超过10MB', color: 'error' })
    input.value = ''
    return
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

    if (result.success) {
      referenceImages.value = [result.url]
    }
  } catch (error: any) {
    toast.add({ title: '图片上传失败', description: error.message, color: 'error' })
  } finally {
    isUploading.value = false
  }

  input.value = ''
}

// 移除参考图
function removeImage() {
  referenceImages.value = []
}

// 提交生成
async function handleSubmit() {
  if (!prompt.value.trim()) {
    toast.add({ title: '请输入提示词', color: 'warning' })
    return
  }

  if (!selectedUpstreamId.value || selectedAimodelId.value === null || !selectedAimodel.value) {
    toast.add({ title: '请先选择模型配置', color: 'warning' })
    return
  }

  isSubmitting.value = true
  try {
    const videoParams: any = {
      aspectRatio: isVeoModel.value
        ? (veoAspectRatioOptions.some(o => o.value === aspectRatio.value) ? aspectRatio.value : '16:9')
        : aspectRatio.value,
    }

    // 即梦特有参数
    if (isJimengModel.value) {
      videoParams.size = size.value
    }

    // Veo 特有参数
    if (isVeoModel.value) {
      videoParams.enhancePrompt = enhancePrompt.value
      videoParams.enableUpsample = enableUpsample.value
    }

    emit('submit', {
      prompt: prompt.value,
      images: referenceImages.value,
      upstreamId: selectedUpstreamId.value,
      aimodelId: selectedAimodelId.value,
      modelType: selectedAimodel.value.modelType as VideoModelType,
      apiFormat: selectedAimodel.value.apiFormat,
      modelName: selectedAimodel.value.modelName,
      videoParams,
    })
  } finally {
    isSubmitting.value = false
  }
}

// 设置面板内容（供外部调用）
function setContent(newPrompt: string | null, images: string[]) {
  prompt.value = newPrompt || ''
  referenceImages.value = images.slice(0, 1)
}

// 暴露给父组件
defineExpose({
  setContent,
})
</script>

<template>
  <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-2xl p-6 border border-(--ui-border)">
    <!-- 模型选择 -->
    <UFormField label="选择模型" class="mb-4">
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
        category="video"
        show-type-label
        v-model:upstream-id="selectedUpstreamId"
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

    <!-- 参考图上传区 -->
    <UFormField v-if="selectedAimodel" label="参考图 (可选)" class="mb-6">
      <template #hint>
        <span class="text-(--ui-text-dimmed) text-xs">支持 JPG、PNG，最大10MB</span>
      </template>

      <div class="flex gap-3 flex-wrap">
        <!-- 已上传的图片 -->
        <div
          v-if="referenceImages.length > 0"
          class="relative w-24 h-24 rounded-lg overflow-hidden group"
        >
          <img :src="referenceImages[0]" class="w-full h-full object-cover" />
          <button
            type="button"
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            @click="removeImage"
          >
            <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
          </button>
        </div>

        <!-- 上传按钮 -->
        <label
          v-if="referenceImages.length === 0"
          class="w-24 h-24 rounded-lg border-2 border-dashed border-(--ui-border-accented) hover:border-(--ui-primary) transition-colors flex flex-col items-center justify-center cursor-pointer"
        >
          <UIcon name="i-heroicons-cloud-arrow-up" class="w-8 h-8 text-(--ui-text-dimmed) mb-1" />
          <span class="text-(--ui-text-dimmed) text-xs">上传</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            class="hidden"
            @change="handleFileChange"
          />
        </label>
      </div>
    </UFormField>

    <!-- 提示词输入 -->
    <UFormField label="描述你想要的视频" class="mb-4">
      <UTextarea
        v-model="prompt"
        placeholder="例如：一只猫在草地上奔跑，慢动作，电影感"
        :rows="6"
        class="w-full"
      />
    </UFormField>

    <!-- 宽高比选择 -->
    <UFormField v-if="selectedAimodel" label="宽高比" class="mb-4">
      <USelect
        v-model="aspectRatio"
        :items="isVeoModel ? veoAspectRatioOptions : aspectRatioOptions"
        value-key="value"
        label-key="label"
        class="w-full"
      />
    </UFormField>

    <!-- 即梦特有参数：分辨率 -->
    <UFormField v-if="isJimengModel" label="分辨率" class="mb-4">
      <USelect
        v-model="size"
        :items="sizeOptions"
        value-key="value"
        label-key="label"
        class="w-full"
      />
    </UFormField>

    <!-- Veo 特有参数 -->
    <div v-if="isVeoModel" class="space-y-4 mb-4">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-sm text-(--ui-text)">提示词增强</span>
          <span class="text-xs text-(--ui-text-dimmed)">自动优化和翻译提示词</span>
        </div>
        <USwitch v-model="enhancePrompt" />
      </div>
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-sm text-(--ui-text)">超分辨率</span>
          <span class="text-xs text-(--ui-text-dimmed)">提升视频画质（耗时更长）</span>
        </div>
        <USwitch v-model="enableUpsample" />
      </div>
    </div>

    <!-- 提交按钮 -->
    <UButton
      block
      size="lg"
      :loading="isSubmitting"
      :disabled="!prompt.trim() || !selectedUpstreamId || selectedAimodelId === null || upstreams.length === 0"
      class="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-video-camera" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>

<script setup lang="ts">
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { VideoModelType, ApiFormat, ModelParams } from '../../shared/types'
import { getApiFormatLabel } from '../../shared/registry'
import {
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
    aimodelId: number
    modelType: VideoModelType
    apiFormat: ApiFormat
    modelName: string
    modelParams: ModelParams
  }]
}>()

const toast = useToast()
const { settings, isLoaded: settingsLoaded, loadSettings } = useUserSettings()

const prompt = ref('')
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

// 视频参数
const aspectRatio = ref('16:9')
const size = ref('1080P')
const enhancePrompt = ref(true)
const enableUpsample = ref(false)
// Sora 参数
const orientation = ref<'landscape' | 'portrait'>('landscape')
const soraSize = ref<'small' | 'large'>('small')
const duration = ref(10)
const watermark = ref(false)
const soraPrivate = ref(false)

// 宽高比选项（即梦通用）
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

// Sora 选项
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

// Grok Video 宽高比选项
const grokAspectRatioOptions = [
  { label: '3:2 (横屏)', value: '3:2' },
  { label: '2:3 (竖屏)', value: '2:3' },
  { label: '1:1 (方形)', value: '1:1' },
]

// 加载用户设置
onMounted(async () => {
  if (!settingsLoaded.value) {
    await loadSettings()
  }
})

// 监听用户设置和 upstreams 加载完成，设置工作台默认模型
watch([settingsLoaded, () => props.upstreams], ([loaded, upstreams]) => {
  // 如果已经选择了模型，不再自动选择
  if (selectedAimodelId.value) return

  // 使用用户设置的默认模型
  if (loaded) {
    const workbenchAimodelId = settings.value[USER_SETTING_KEYS.VIDEO_WORKBENCH_AIMODEL_ID]
    if (workbenchAimodelId) {
      // 验证模型是否存在于当前 upstreams 中
      for (const upstream of upstreams) {
        if (upstream.aimodels?.some(m => m.id === workbenchAimodelId)) {
          selectedAimodelId.value = workbenchAimodelId as number
          return
        }
      }
    }
  }
}, { immediate: true })

// 模型选择器引用
const modelSelectorRef = ref<{
  selectedUpstream: Upstream | undefined
  selectedAimodel: Aimodel | undefined
} | null>(null)

// 选中的 AI 模型（从 ModelSelector 获取）
const selectedAimodel = computed((): Aimodel | undefined => {
  return modelSelectorRef.value?.selectedAimodel
})

// 判断模型类型
const isJimengModel = computed(() => selectedAimodel.value?.modelType === 'jimeng-video')
const isVeoModel = computed(() => selectedAimodel.value?.modelType === 'veo')
const isSoraModel = computed(() => selectedAimodel.value?.modelType === 'sora')
const isGrokVideoModel = computed(() => selectedAimodel.value?.modelType === 'grok-video')

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
  if (!file) return

  if (file.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
    toast.add({ title: '图片大小不能超过10MB', color: 'error' })
    input.value = ''
    return
  }

  // 上传到服务器
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file!)

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

  if (selectedAimodelId.value === null || !selectedAimodel.value) {
    toast.add({ title: '请先选择模型配置', color: 'warning' })
    return
  }

  isSubmitting.value = true
  try {
    // 根据模型类型构建 modelParams
    let modelParams: ModelParams = {}

    if (isJimengModel.value) {
      modelParams = {
        aspectRatio: aspectRatio.value,
        size: size.value,
      }
    } else if (isVeoModel.value) {
      modelParams = {
        aspectRatio: veoAspectRatioOptions.some(o => o.value === aspectRatio.value) ? aspectRatio.value : '16:9',
        enhancePrompt: enhancePrompt.value,
        enableUpsample: enableUpsample.value,
      }
    } else if (isSoraModel.value) {
      modelParams = {
        orientation: orientation.value,
        size: soraSize.value,
        duration: duration.value,
        watermark: watermark.value,
        private: soraPrivate.value,
      }
    } else if (isGrokVideoModel.value) {
      modelParams = {
        aspectRatio: grokAspectRatioOptions.some(o => o.value === aspectRatio.value) ? aspectRatio.value : '3:2',
        size: '720P',
      }
    }

    emit('submit', {
      prompt: prompt.value,
      images: referenceImages.value,
      aimodelId: selectedAimodelId.value!,
      modelType: selectedAimodel.value.modelType as VideoModelType,
      apiFormat: selectedAimodel.value.apiFormat,
      modelName: selectedAimodel.value.modelName,
      modelParams,
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
        category="video"
        v-model:aimodel-id="selectedAimodelId"
        no-auto-select
      />
    </UFormField>

    <!-- 模型信息模态框 -->
    <UModal v-model:open="showModelInfoModal" title="模型信息">
      <template #body>
        <div v-if="selectedAimodel" class="space-y-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-(--ui-text-muted)">请求格式：</span>
            <span class="text-(--ui-text)">{{ getApiFormatLabel(selectedAimodel.apiFormat) }}</span>
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
    <UFormField v-if="selectedAimodel" label="参考图 (可选)">
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
    <UFormField label="描述你想要的视频">
      <UTextarea
        v-model="prompt"
        placeholder="例如：一只猫在草地上奔跑，慢动作，电影感"
        :rows="6"
        class="w-full"
      />
    </UFormField>

    <!-- 即梦：宽高比 + 分辨率 -->
    <template v-if="isJimengModel">
      <UFormField label="宽高比">
        <USelect
          v-model="aspectRatio"
          :items="aspectRatioOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField label="分辨率">
        <USelect
          v-model="size"
          :items="sizeOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
    </template>

    <!-- Veo：宽高比 + 提示词增强 + 超分 -->
    <template v-if="isVeoModel">
      <UFormField label="宽高比">
        <USelect
          v-model="aspectRatio"
          :items="veoAspectRatioOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <div class="space-y-4">
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
    </template>

    <!-- Sora：方向 + 分辨率 + 时长 + 水印 + 隐私 -->
    <template v-if="isSoraModel">
      <UFormField label="方向">
        <USelect
          v-model="orientation"
          :items="soraOrientationOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField label="分辨率">
        <USelect
          v-model="soraSize"
          :items="soraSizeOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField label="时长">
        <USelect
          v-model="duration"
          :items="soraDurationOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-sm text-(--ui-text)">添加水印</span>
            <span class="text-xs text-(--ui-text-dimmed)">在视频上添加水印</span>
          </div>
          <USwitch v-model="watermark" />
        </div>
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-sm text-(--ui-text)">隐私模式</span>
            <span class="text-xs text-(--ui-text-dimmed)">视频不公开</span>
          </div>
          <USwitch v-model="soraPrivate" />
        </div>
      </div>
    </template>

    <!-- Grok Video：宽高比（分辨率固定 720P） -->
    <template v-if="isGrokVideoModel">
      <UFormField label="宽高比">
        <USelect
          v-model="aspectRatio"
          :items="grokAspectRatioOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField label="分辨率">
        <UInput value="720P" disabled class="w-full" />
      </UFormField>
    </template>

    <!-- 提交按钮 -->
    <UButton
      block
      size="lg"
      :loading="isSubmitting"
      :disabled="!prompt.trim() || selectedAimodelId === null || upstreams.length === 0"
      class="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-video-camera" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>

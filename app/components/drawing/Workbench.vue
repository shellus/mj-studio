<script setup lang="ts">
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { ImageModelType, ApiFormat } from '../../shared/types'
import {
  API_FORMAT_LABELS,
  MODEL_USAGE_HINTS,
  MODELS_WITHOUT_REFERENCE_IMAGE,
  MODELS_WITH_NEGATIVE_PROMPT,
  MAX_REFERENCE_IMAGE_SIZE_BYTES,
  MAX_REFERENCE_IMAGE_COUNT,
  USER_SETTING_KEYS,
} from '../../shared/constants'

const props = defineProps<{
  upstreams: Upstream[]
}>()

const emit = defineEmits<{
  submit: [prompt: string, negativePrompt: string, images: string[], upstreamId: number, aimodelId: number, modelType: ImageModelType, apiFormat: ApiFormat, modelName: string]
}>()

const toast = useToast()
const { getAuthHeader } = useAuth()
const { settings, isLoaded: settingsLoaded, loadSettings } = useUserSettings()

const prompt = ref('')
const negativePrompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedUpstreamId = ref<number | null>(null)
const selectedAimodelId = ref<number | null>(null)

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
    const result = await $fetch<{ success: boolean; optimizedPrompt: string }>('/api/prompts/optimize', {
      method: 'POST',
      headers: getAuthHeader(),
      body: {
        prompt: prompt.value,
        upstreamId: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_UPSTREAM_ID],
        aimodelId: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID],
        modelName: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_MODEL_NAME],
      },
    })

    if (result.success && result.optimizedPrompt) {
      prompt.value = result.optimizedPrompt
      toast.add({ title: '提示词已优化', color: 'success' })
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

// 当前模型的使用提示
const currentModelHint = computed(() => {
  if (!selectedAimodel.value) return undefined
  return MODEL_USAGE_HINTS[selectedAimodel.value.modelType as ImageModelType]
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
    const negativePromptToSubmit = supportsNegativePrompt.value ? negativePrompt.value : ''
    emit(
      'submit',
      prompt.value,
      negativePromptToSubmit,
      imagesToSubmit,
      selectedUpstreamId.value,
      selectedAimodelId.value,
      selectedAimodel.value.modelType as ImageModelType,
      selectedAimodel.value.apiFormat,
      selectedAimodel.value.modelName
    )
  } finally {
    isSubmitting.value = false
  }
}

// 设置面板内容（供外部调用）
function setContent(newPrompt: string | null, newNegativePrompt: string | null, images: string[]) {
  prompt.value = newPrompt || ''
  negativePrompt.value = newNegativePrompt || ''
  referenceImages.value = images.slice(0, MAX_REFERENCE_IMAGE_COUNT)
}

// 暴露给父组件
defineExpose({
  setContent,
})
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-(--ui-text) text-lg font-medium">绘图工作台</h2>

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
          category="image"
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
          <div
            v-if="currentModelHint"
            class="mt-4 p-3 rounded-lg border"
            :class="currentModelHint.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-(--ui-primary)/10 border-(--ui-primary)/30'"
          >
            <div class="flex items-start gap-2">
              <UIcon
                :name="currentModelHint.type === 'warning' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-light-bulb'"
                :class="['w-4 h-4 mt-0.5 shrink-0', currentModelHint.type === 'warning' ? 'text-amber-500' : 'text-(--ui-primary)']"
              />
              <p
                class="text-sm"
                :class="currentModelHint.type === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-(--ui-primary)'"
              >
                {{ currentModelHint.text }}
              </p>
            </div>
          </div>
        </div>
        <p v-else class="text-(--ui-text-muted) text-sm">请先选择一个模型</p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="showModelInfoModal = false">关闭</UButton>
      </template>
    </UModal>

    <!-- 参考图上传区 -->
    <UFormField v-if="supportsReferenceImages" label="参考图 (可选，最多3张)" class="mb-6">
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
    <UFormField label="描述你想要的图片" class="mb-4">
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

    <!-- 负面提示词输入（仅支持的模型显示） -->
    <UFormField v-if="supportsNegativePrompt" label="负面提示词 (可选)" class="mb-4">
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

      <!-- 提交按钮 -->
      <UButton
        block
        size="lg"
        :loading="isSubmitting"
        :disabled="(!prompt.trim() && referenceImages.length === 0) || !selectedUpstreamId || selectedAimodelId === null || upstreams.length === 0"
        class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        @click="handleSubmit"
      >
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mr-2" />
        开始生成
      </UButton>
    </div>
  </div>
</template>

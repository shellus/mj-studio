<script setup lang="ts">
import type { Upstream } from '~/composables/useUpstreams'
import type { ImageModelType, VideoModelType, ApiFormat, ImageModelParams, ModelParams } from '../../shared/types'

const props = defineProps<{
  upstreams: Upstream[]
}>()

const emit = defineEmits<{
  submitImage: [data: {
    prompt: string
    images: string[]
    upstreamId: number
    aimodelId: number
    modelType: ImageModelType
    apiFormat: ApiFormat
    modelName: string
    modelParams: ImageModelParams
  }]
  submitVideo: [data: {
    prompt: string
    images: string[]
    upstreamId: number
    aimodelId: number
    modelType: VideoModelType
    apiFormat: ApiFormat
    modelName: string
    modelParams: ModelParams
  }]
}>()

// 当前标签页
const activeTab = ref('image')

// 标签页配置
const tabs = [
  { label: '图片', value: 'image', icon: 'i-heroicons-photo' },
  { label: '视频', value: 'video', icon: 'i-heroicons-video-camera' },
]

// 检查是否有视频模型配置
const hasVideoModels = computed(() => {
  return props.upstreams.some(u =>
    u.aimodels?.some(m => m.category === 'video' && !m.deletedAt)
  )
})

// 图片表单引用
const imageFormRef = ref<{
  setContent: (prompt: string | null, modelParams: ImageModelParams | null, images: string[]) => void
} | null>(null)

// 视频表单引用
const videoFormRef = ref<{
  setContent: (prompt: string | null, images: string[]) => void
} | null>(null)

// 处理图片表单提交
function handleImageSubmit(data: {
  prompt: string
  images: string[]
  upstreamId: number
  aimodelId: number
  modelType: ImageModelType
  apiFormat: ApiFormat
  modelName: string
  modelParams: ImageModelParams
}) {
  emit('submitImage', data)
}

// 处理视频表单提交
function handleVideoSubmit(data: {
  prompt: string
  images: string[]
  upstreamId: number
  aimodelId: number
  modelType: VideoModelType
  apiFormat: ApiFormat
  modelName: string
  modelParams: ModelParams
}) {
  emit('submitVideo', data)
}

// 设置面板内容（供外部调用）
function setContent(newPrompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  if (activeTab.value === 'video' && videoFormRef.value) {
    videoFormRef.value.setContent(newPrompt, images)
  } else if (imageFormRef.value) {
    imageFormRef.value.setContent(newPrompt, modelParams, images)
  }
}

// 暴露给父组件
defineExpose({
  setContent,
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-(--ui-text) text-lg font-medium">创作工作台</h2>
      <div class="flex items-center gap-2">
        <NuxtLink to="/workflow" class="text-(--ui-text-muted) hover:text-(--ui-primary) transition-colors" title="工作流编排">
          <UIcon name="i-heroicons-square-3-stack-3d" class="w-5 h-5" />
        </NuxtLink>
        <NuxtLink to="/faq" class="text-(--ui-text-muted) hover:text-(--ui-text) transition-colors" title="帮助中心">
          <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
        </NuxtLink>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="flex border-b border-(--ui-border)">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :class="[
          'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
          activeTab === tab.value
            ? 'border-(--ui-primary) text-(--ui-primary)'
            : 'border-transparent text-(--ui-text-muted) hover:text-(--ui-text)',
          tab.value === 'video' && !hasVideoModels ? 'opacity-50 cursor-not-allowed' : ''
        ]"
        :disabled="tab.value === 'video' && !hasVideoModels"
        @click="activeTab = tab.value"
      >
        <UIcon :name="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- 图片表单 -->
    <StudioImageForm
      v-if="activeTab === 'image'"
      ref="imageFormRef"
      :upstreams="upstreams"
      @submit="handleImageSubmit"
    />

    <!-- 视频表单 -->
    <StudioVideoForm
      v-else-if="activeTab === 'video'"
      ref="videoFormRef"
      :upstreams="upstreams"
      @submit="handleVideoSubmit"
    />

    <!-- 没有视频模型配置时的提示 -->
    <div
      v-if="activeTab === 'video' && !hasVideoModels"
      class="bg-(--ui-bg-elevated) rounded-lg p-8 border border-(--ui-border) text-center"
    >
      <UIcon name="i-heroicons-video-camera" class="w-12 h-12 text-(--ui-text-dimmed) mx-auto mb-3" />
      <p class="text-(--ui-text-muted) mb-4">暂无视频模型配置</p>
      <NuxtLink to="/settings/upstreams">
        <UButton variant="soft">
          <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
          添加视频模型
        </UButton>
      </NuxtLink>
    </div>
  </div>
</template>

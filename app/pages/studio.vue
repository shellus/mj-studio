<script setup lang="ts">
import type { VideoModelType, ApiFormat, ImageModelParams, ModelParams } from '~/shared/types'

definePageMeta({
  middleware: 'auth',
})

const { loadTasks } = useTasks()
const { upstreams } = useUpstreams()
const toast = useToast()

// StudioWorkbench 组件引用
const workbenchRef = ref<{ setContent: (prompt: string | null, modelParams: ImageModelParams | null, images: string[]) => void } | null>(null)

// 页面加载时获取任务列表
onMounted(() => {
  loadTasks()
})

// 提交图片任务
async function handleImageSubmit(data: {
  prompt: string
  images: string[]
  upstreamId: number
  aimodelId: number
  modelType: string
  apiFormat: string
  modelName: string
  modelParams: ImageModelParams
}) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        taskType: 'image',
        prompt: data.prompt,
        modelParams: data.modelParams,
        images: data.images,
        type: data.apiFormat === 'mj-proxy' && data.images.length > 0 && !data.prompt ? 'blend' : 'imagine',
        upstreamId: data.upstreamId,
        aimodelId: data.aimodelId,
        modelType: data.modelType,
        apiFormat: data.apiFormat,
        modelName: data.modelName,
      },
    })

    if (result.success) {
      // 任务添加由 SSE 事件 task.created 处理
      toast.add({
        title: '任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 提交视频任务
async function handleVideoSubmit(data: {
  prompt: string
  images: string[]
  upstreamId: number
  aimodelId: number
  modelType: VideoModelType
  apiFormat: ApiFormat
  modelName: string
  modelParams: ModelParams
}) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        taskType: 'video',
        prompt: data.prompt,
        modelParams: data.modelParams,
        images: data.images,
        upstreamId: data.upstreamId,
        aimodelId: data.aimodelId,
        modelType: data.modelType,
        apiFormat: data.apiFormat,
        modelName: data.modelName,
      },
    })

    if (result.success) {
      // 任务添加由 SSE 事件 task.created 处理
      toast.add({
        title: '视频任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 复制任务内容到工作台
function handleCopyToPanel(prompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  workbenchRef.value?.setContent(prompt, modelParams, images)
  toast.add({
    title: '已复制到工作台',
    color: 'success',
  })
}

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)] flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
    <!-- 工作台面板 -->
    <div class="flex-shrink-0 border-b lg:border-b-0 lg:border-r border-(--ui-border) bg-(--ui-bg-elevated) p-4 lg:w-[340px] lg:overflow-y-auto">
      <StudioWorkbench ref="workbenchRef" :upstreams="upstreams" @submit-image="handleImageSubmit" @submit-video="handleVideoSubmit" />
    </div>

    <!-- 任务列表 -->
    <div class="flex-1 p-4 lg:overflow-y-auto">
      <StudioList @copy-to-panel="handleCopyToPanel" />
    </div>
  </div>
</template>

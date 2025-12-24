<script setup lang="ts">
import type { MjDrawingParams } from '~/composables/useMarkdown'
import {
  DEFAULT_FALLBACK_ESTIMATED_TIME,
  PROGRESS_UPDATE_INTERVAL_MS,
  PROGRESS_TIME_BUFFER_RATIO,
} from '~/shared/constants'

const props = defineProps<{
  params: MjDrawingParams
}>()

// 任务状态
const status = ref<'idle' | 'pending' | 'submitting' | 'processing' | 'success' | 'failed'>('idle')
const progress = ref<string | null>(null)
const imageUrl = ref<string | null>(null)
const taskId = ref<number | null>(null)
const error = ref<string | null>(null)
const createdAt = ref<Date | null>(null)

// 轮询定时器
let pollTimer: ReturnType<typeof setInterval> | null = null

// 图片预览
const showPreview = ref(false)

// 详情弹窗
const showDetail = ref(false)

// 进度条相关
const now = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(status.value))

// 状态显示信息
const statusInfo = computed(() => {
  switch (status.value) {
    case 'idle':
      return { text: '未生成', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-photo', showBars: false }
    case 'pending':
      return { text: '等待中', color: 'text-(--ui-warning)', icon: 'i-heroicons-clock', showBars: false }
    case 'submitting':
      return { text: '提交中', color: 'text-(--ui-info)', icon: null, showBars: true }
    case 'processing':
      return { text: progress.value || '生成中', color: 'text-(--ui-primary)', icon: null, showBars: true }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)', icon: 'i-heroicons-check-circle', showBars: false }
    case 'failed':
      return { text: '失败', color: 'text-(--ui-error)', icon: 'i-heroicons-x-circle', showBars: false }
    default:
      return { text: '未知', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-question-mark-circle', showBars: false }
  }
})

// 进度百分比
const progressPercent = computed(() => {
  if (!isLoading.value || !createdAt.value) return 0
  const start = createdAt.value.getTime()
  const elapsed = (now.value - start) / 1000
  const bufferedTime = DEFAULT_FALLBACK_ESTIMATED_TIME * PROGRESS_TIME_BUFFER_RATIO
  return Math.min((elapsed / bufferedTime) * 100, 100)
})

// 启动/停止进度条计时器
watch(isLoading, (loading) => {
  if (loading) {
    now.value = Date.now()
    progressTimer = setInterval(() => {
      now.value = Date.now()
    }, PROGRESS_UPDATE_INTERVAL_MS)
  } else if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}, { immediate: true })

// 调用 API 查询或创建任务
async function fetchOrCreateTask() {
  if (!props.params.uniqueId || !props.params.prompt) {
    error.value = '缺少必要参数'
    status.value = 'failed'
    return
  }

  status.value = 'pending'
  error.value = null
  createdAt.value = new Date()

  try {
    const res = await $fetch('/api/illustrations', {
      method: 'POST',
      body: {
        uniqueId: props.params.uniqueId,
        prompt: props.params.prompt,
        model: props.params.model,
        negative: props.params.negative,
      },
    })

    taskId.value = res.taskId
    updateFromResponse(res)

    // 如果任务未完成，开始轮询
    if (status.value === 'pending' || status.value === 'submitting' || status.value === 'processing') {
      startPolling()
    }
  } catch (e: any) {
    error.value = e.data?.message || e.message || '请求失败'
    status.value = 'failed'
  }
}

// 从响应更新状态
function updateFromResponse(res: any) {
  progress.value = res.progress
  imageUrl.value = res.imageUrl
  error.value = res.error

  if (res.status === 'success') {
    status.value = 'success'
    stopPolling()
  } else if (res.status === 'failed') {
    status.value = 'failed'
    stopPolling()
  } else if (res.status === 'submitting') {
    status.value = 'submitting'
  } else if (res.status === 'processing') {
    status.value = 'processing'
  } else {
    status.value = 'pending'
  }
}

// 开始轮询
function startPolling() {
  if (pollTimer) return

  pollTimer = setInterval(async () => {
    if (!taskId.value) return

    try {
      const res = await $fetch(`/api/tasks/${taskId.value}`)
      updateFromResponse(res)
    } catch {
      // 轮询失败不处理
    }
  }, 2000)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 重试
function retry() {
  fetchOrCreateTask()
}

// 下载图片
function downloadImage() {
  if (!imageUrl.value) return
  const a = document.createElement('a')
  a.href = imageUrl.value
  a.download = `illustration-${props.params.uniqueId}.png`
  a.target = '_blank'
  a.click()
}

// 组件挂载时自动请求
onMounted(() => {
  fetchOrCreateTask()
})

// 组件卸载时清理
onUnmounted(() => {
  stopPolling()
  if (progressTimer) clearInterval(progressTimer)
})
</script>

<template>
  <div class="mj-drawing-container my-3 bg-(--ui-bg-elevated) rounded-xl border border-(--ui-border) overflow-hidden max-w-md">
    <!-- 图片区域 -->
    <div class="aspect-[4/3] bg-black/10 relative">
      <!-- 成功时显示图片 -->
      <img
        v-if="status === 'success' && imageUrl"
        :src="imageUrl"
        :alt="params.prompt"
        class="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
        @click="showPreview = true"
      />

      <!-- 非成功状态显示状态信息 -->
      <div
        v-else
        class="w-full h-full flex items-center justify-center p-4"
      >
        <div class="text-center">
          <!-- 竖线加载动画 -->
          <DrawingLoader
            v-if="statusInfo.showBars"
            :class="['w-12 h-12 mb-2 mx-auto', statusInfo.color]"
          />
          <!-- 图标 -->
          <UIcon
            v-else-if="statusInfo.icon"
            :name="statusInfo.icon"
            :class="['w-12 h-12 mb-2', statusInfo.color]"
          />
          <p :class="['text-sm mb-2', statusInfo.color]">{{ statusInfo.text }}</p>

          <!-- 失败时显示错误信息 -->
          <p v-if="error && status === 'failed'" class="text-(--ui-error) text-xs leading-relaxed line-clamp-3 px-2 mb-2">
            {{ error }}
          </p>

          <!-- 空闲状态显示生成按钮 -->
          <UButton v-if="status === 'idle'" size="sm" @click="fetchOrCreateTask">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
            生成插图
          </UButton>

          <!-- 失败状态显示重试按钮 -->
          <UButton v-if="status === 'failed'" size="sm" variant="outline" @click="retry">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
            重试
          </UButton>
        </div>
      </div>

      <!-- 左上角按钮组（成功时显示） -->
      <div v-if="status === 'success' && imageUrl" class="absolute top-2 left-2 flex gap-1">
        <!-- 下载按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="下载图片"
          @click="downloadImage"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 放大查看按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="放大查看"
          @click="showPreview = true"
        >
          <UIcon name="i-heroicons-magnifying-glass-plus" class="w-4 h-4 text-white" />
        </button>
      </div>

      <!-- 模型标签 -->
      <div
        v-if="params.model"
        class="absolute bottom-2 left-2 px-2 py-1 rounded-full text-xs text-white font-medium bg-indigo-500/80"
      >
        {{ params.model }}
      </div>

      <!-- 进度条（进行中状态显示） -->
      <div
        v-if="isLoading"
        class="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20 overflow-hidden"
      >
        <div
          class="h-full transition-all duration-500 ease-out animate-shimmer"
          :style="{
            width: `${progressPercent}%`,
            backgroundImage: 'linear-gradient(90deg, #8b5cf6, #ec4899, #06b6d4, #8b5cf6)',
            backgroundSize: '200% 100%',
          }"
        />
      </div>

      <!-- 右下角信息按钮 -->
      <button
        class="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
        title="查看详情"
        @click="showDetail = true"
      >
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-white" />
      </button>
    </div>

    <!-- 图片预览 Modal -->
    <UModal v-model:open="showPreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-(--ui-bg) flex items-center justify-center">
          <img :src="imageUrl!" :alt="params.prompt" class="max-h-[85vh] object-contain" />
          <button
            class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            @click="showPreview = false"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-white" />
          </button>
          <button
            class="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            title="下载图片"
            @click="downloadImage"
          >
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-white" />
          </button>
        </div>
      </template>
    </UModal>

    <!-- 详情 Modal -->
    <UModal v-model:open="showDetail" title="插图详情">
      <template #body>
        <div class="space-y-3 text-sm">
          <div>
            <span class="text-(--ui-text-muted) block mb-1">标识</span>
            <p class="text-(--ui-text) font-mono text-xs">{{ params.uniqueId }}</p>
          </div>
          <div>
            <span class="text-(--ui-text-muted) block mb-1">提示词</span>
            <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ params.prompt }}</p>
          </div>
          <div v-if="params.model" class="flex justify-between">
            <span class="text-(--ui-text-muted)">模型</span>
            <span class="text-(--ui-text) font-mono text-xs">{{ params.model }}</span>
          </div>
          <div v-if="params.negative">
            <span class="text-(--ui-text-muted) block mb-1">负面提示词</span>
            <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ params.negative }}</p>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

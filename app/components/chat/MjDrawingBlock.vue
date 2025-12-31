<script setup lang="ts">
import type { MjDrawingParams } from '~/composables/useMarkdown'
import {
  DEFAULT_FALLBACK_ESTIMATED_TIME,
  PROGRESS_UPDATE_INTERVAL_MS,
  PROGRESS_TIME_BUFFER_RATIO,
} from '~/shared/constants'
import {
  useGlobalEvents,
  type TaskStatusUpdated,
  type TaskBlurUpdated,
} from '~/composables/useGlobalEvents'

const props = defineProps<{
  params: MjDrawingParams
}>()

const { on } = useGlobalEvents()

// 任务状态
const status = ref<'idle' | 'pending' | 'submitting' | 'processing' | 'success' | 'failed'>('idle')
const progress = ref<string | null>(null)
const resourceUrl = ref<string | null>(null)
const taskId = ref<number | null>(null)
const error = ref<string | null>(null)
const createdAt = ref<Date | null>(null)
const isBlurred = ref(true)

// 图片预览
const showPreview = ref(false)

// 详情弹窗
const showDetail = ref(false)

// 操作按钮显示状态（移动端点击切换，PC端悬浮显示）
const showActions = ref(false)

// 进度条相关
const now = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(status.value))

// 状态显示信息
const statusInfo = computed(() => {
  switch (status.value) {
    case 'idle':
      return { text: '等待提交', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-sparkles', showBars: false }
    case 'pending':
      return { text: '排队中...', color: 'text-(--ui-warning)', icon: 'i-heroicons-clock', showBars: false }
    case 'submitting':
      return { text: '正在提交...', color: 'text-(--ui-info)', icon: null, showBars: true }
    case 'processing':
      return { text: progress.value || '正在创作中...', color: 'text-(--ui-primary)', icon: null, showBars: true }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)', icon: 'i-heroicons-check-circle', showBars: false }
    case 'failed':
      return { text: '生成失败', color: 'text-(--ui-error)', icon: 'i-heroicons-exclamation-triangle', showBars: false }
    default:
      return { text: '未知状态', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-question-mark-circle', showBars: false }
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
async function fetchOrCreateTask(startTask = false) {
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
        autostart: startTask,
      },
    })

    taskId.value = res.taskId
    updateFromResponse(res, startTask)
    // 任务状态更新完全通过 SSE 事件处理
  } catch (e: any) {
    error.value = e.data?.message || e.message || '请求失败'
    status.value = 'failed'
  }
}

// 从响应更新状态
function updateFromResponse(res: any, wasStarted = true) {
  progress.value = res.progress
  resourceUrl.value = res.resourceUrl
  error.value = res.error
  if (res.isBlurred !== undefined) {
    isBlurred.value = res.isBlurred
  }

  if (res.status === 'success') {
    status.value = 'success'
  } else if (res.status === 'failed') {
    status.value = 'failed'
  } else if (res.status === 'submitting') {
    status.value = 'submitting'
  } else if (res.status === 'processing') {
    status.value = 'processing'
  } else if (res.status === 'pending') {
    // pending 状态：如果未启动任务，显示为 idle 让用户点击
    status.value = wasStarted ? 'pending' : 'idle'
  } else {
    status.value = 'idle'
  }
}

// 下载图片
function downloadImage() {
  if (!resourceUrl.value) return
  const a = document.createElement('a')
  a.href = resourceUrl.value
  a.download = `illustration-${props.params.uniqueId}.png`
  a.target = '_blank'
  a.click()
}

// 切换模糊状态并同步到后端
async function toggleBlur() {
  const newBlurred = !isBlurred.value
  isBlurred.value = newBlurred
  try {
    await $fetch('/api/illustrations/blur', {
      method: 'PATCH',
      body: {
        uniqueId: props.params.uniqueId,
        isBlurred: newBlurred,
      },
    })
  } catch (err) {
    console.error('保存模糊状态失败:', err)
  }
}

// 重新生成（删除旧任务，创建新任务）
async function regenerate() {
  if (!props.params.uniqueId || !props.params.prompt) {
    error.value = '缺少必要参数'
    status.value = 'failed'
    return
  }

  status.value = 'pending'
  error.value = null
  resourceUrl.value = null
  createdAt.value = new Date()

  try {
    const res = await $fetch('/api/illustrations/regenerate', {
      method: 'POST',
      body: {
        uniqueId: props.params.uniqueId,
        prompt: props.params.prompt,
        model: props.params.model,
        negative: props.params.negative,
      },
    })

    taskId.value = res.taskId
    updateFromResponse(res, true)
    // 任务状态更新完全通过 SSE 事件处理
  } catch (e: any) {
    error.value = e.data?.message || e.message || '重新生成失败'
    status.value = 'failed'
  }
}

// ==================== 事件处理器 ====================

// 处理任务状态更新事件
function handleTaskStatusUpdated(data: TaskStatusUpdated) {
  // 只处理当前任务的事件
  if (data.taskId !== taskId.value) return

  // 更新状态
  if (data.progress !== undefined) {
    progress.value = `${data.progress}%`
  }
  if (data.resourceUrl !== undefined) {
    resourceUrl.value = data.resourceUrl
  }
  if (data.error !== undefined) {
    error.value = data.error
  }

  // 映射状态
  const statusMap: Record<string, typeof status.value> = {
    pending: 'pending',
    submitting: 'submitting',
    processing: 'processing',
    success: 'success',
    failed: 'failed',
    cancelled: 'failed',
  }

  if (data.status in statusMap) {
    status.value = statusMap[data.status]!
  }
}

// 处理模糊状态更新事件
function handleTaskBlurUpdated(data: TaskBlurUpdated) {
  if (data.taskId !== taskId.value) return
  isBlurred.value = data.isBlurred
}

// 事件取消订阅函数
let unsubscribeStatus: (() => void) | null = null
let unsubscribeBlur: (() => void) | null = null

// 组件挂载时自动请求（传递 autostart 参数）
onMounted(() => {
  fetchOrCreateTask(props.params.autostart ?? false)

  // 注册事件处理器
  unsubscribeStatus = on<TaskStatusUpdated>('task.status.updated', handleTaskStatusUpdated)
  unsubscribeBlur = on<TaskBlurUpdated>('task.blur.updated', handleTaskBlurUpdated)
})

// 组件卸载时清理
onUnmounted(() => {
  if (progressTimer) clearInterval(progressTimer)

  // 取消事件订阅
  unsubscribeStatus?.()
  unsubscribeBlur?.()
})
</script>

<template>
  <div class="mj-drawing-container my-3 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border) overflow-hidden max-w-md">
    <!-- 图片区域 -->
    <div
      class="aspect-[4/3] bg-black/10 relative group"
      @mouseenter="showActions = true"
      @mouseleave="showActions = false"
    >
      <!-- 成功时显示图片 -->
      <img
        v-if="status === 'success' && resourceUrl"
        :src="resourceUrl"
        :alt="params.prompt"
        class="w-full h-full object-contain cursor-pointer transition-all duration-300"
        :class="isBlurred ? 'blur-xl scale-105' : 'hover:opacity-90'"
        @click="toggleBlur(); showActions = !showActions"
      />

      <!-- 非成功状态显示状态信息 -->
      <div
        v-else
        class="w-full h-full flex flex-col p-5"
      >
        <!-- 上半部分：图标 + 状态 + 按钮 -->
        <div class="flex-1 flex flex-col items-center justify-center">
          <!-- 竖线加载动画 -->
          <StudioLoader
            v-if="statusInfo.showBars"
            :class="['w-10 h-10', statusInfo.color]"
          />
          <!-- 图标 -->
          <UIcon
            v-else-if="statusInfo.icon"
            :name="statusInfo.icon"
            :class="['w-10 h-10', statusInfo.color]"
          />
          <p :class="['text-sm font-medium mt-3', statusInfo.color]">{{ statusInfo.text }}</p>

          <!-- 失败时显示错误信息 -->
          <p v-if="error && status === 'failed'" class="text-(--ui-error) text-xs leading-relaxed line-clamp-2 mt-2 max-w-[90%] text-center">
            {{ error }}
          </p>

          <!-- 空闲状态显示生成按钮 -->
          <UButton v-if="status === 'idle'" size="sm" class="mt-4" @click="fetchOrCreateTask(true)">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
            生成插图
          </UButton>

          <!-- 失败状态显示重试按钮 -->
          <UButton v-if="status === 'failed'" size="sm" variant="outline" class="mt-3" @click="regenerate">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
            重试
          </UButton>
        </div>

        <!-- 底部：标题和提示词信息 -->
        <div class="pt-3 border-t border-(--ui-border-muted)">
          <p class="text-sm font-medium text-(--ui-text) truncate" :title="params.uniqueId">
            {{ params.uniqueId }}
          </p>
          <p class="text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed mt-1" :title="params.prompt">
            {{ params.prompt }}
          </p>
        </div>
      </div>

      <!-- 左上角按钮组（成功时显示） -->
      <div
        v-if="status === 'success' && resourceUrl"
        class="absolute top-2 left-2 flex gap-1 transition-opacity"
        :class="showActions ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'"
      >
        <!-- 下载按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="下载图片"
          @click.stop="downloadImage"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 放大查看按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="放大查看"
          @click.stop="showPreview = true"
        >
          <UIcon name="i-heroicons-magnifying-glass-plus" class="w-4 h-4 text-white" />
        </button>
        <!-- 重新生成按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="重新生成"
          @click.stop="regenerate"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-white" />
        </button>
        <!-- 详情按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="查看详情"
          @click.stop="showDetail = true"
        >
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-white" />
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
    </div>

    <!-- 图片预览 Modal -->
    <UModal v-model:open="showPreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-(--ui-bg) flex items-center justify-center">
          <img :src="resourceUrl!" :alt="params.prompt" class="max-h-[85vh] object-contain" />
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

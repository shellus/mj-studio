<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import type { VideoModelType } from '../../shared/types'
import {
  TASK_CARD_MODEL_DISPLAY,
  API_FORMAT_LABELS,
  DEFAULT_VIDEO_ESTIMATED_TIMES,
  DEFAULT_FALLBACK_ESTIMATED_TIME,
  PROGRESS_UPDATE_INTERVAL_MS,
  PROGRESS_TIME_BUFFER_RATIO,
} from '../../shared/constants'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  remove: []
  retry: []
  cancel: []
  blur: [isBlurred: boolean]
  copyToPanel: [prompt: string | null, images: string[]]
}>()

const toast = useToast()

// 复制任务ID
async function copyTaskId() {
  const taskId = String(props.task.id)
  try {
    await navigator.clipboard.writeText(taskId)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = taskId
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  }
}

// 视频模糊状态 - 从任务数据初始化
const isBlurred = ref(props.task.isBlurred ?? true)

// 监听外部状态变化（用于批量切换）
watch(() => props.task.isBlurred, (newVal) => {
  if (newVal !== undefined) {
    isBlurred.value = newVal
  }
})

// 切换模糊状态并同步到后端
async function toggleBlur(blur: boolean) {
  isBlurred.value = blur
  emit('blur', blur)
  try {
    await $fetch(`/api/tasks/${props.task.id}/blur`, {
      method: 'PATCH',
      body: { isBlurred: blur },
    })
  } catch (error) {
    console.error('保存模糊状态失败:', error)
  }
}

// 获取状态显示
const statusInfo = computed(() => {
  switch (props.task.status) {
    case 'pending':
      return { text: '等待中', color: 'text-(--ui-warning)', icon: 'i-heroicons-clock', showBars: false }
    case 'submitting':
      return { text: '提交中', color: 'text-(--ui-info)', icon: null, showBars: true }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-(--ui-primary)', icon: null, showBars: true }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)', icon: 'i-heroicons-check-circle', showBars: false }
    case 'failed':
      return { text: '失败', color: 'text-(--ui-error)', icon: 'i-heroicons-x-circle', showBars: false }
    case 'cancelled':
      return { text: '已取消', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-no-symbol', showBars: false }
    default:
      return { text: '未知', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-question-mark-circle', showBars: false }
  }
})

// 获取模型显示信息
const modelInfo = computed(() => {
  const modelType = props.task.modelType as VideoModelType
  const display = TASK_CARD_MODEL_DISPLAY[modelType] || { label: modelType || '未知', color: 'bg-gray-500/80' }

  return {
    label: display.label,
    type: modelType,
    color: display.color,
  }
})

// 是否显示加载动画
const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(props.task.status))

// 获取当前任务的预计时间（秒）
const estimatedTime = computed(() => {
  const modelType = props.task.modelType as VideoModelType
  return props.task.upstream?.estimatedTime
    ?? DEFAULT_VIDEO_ESTIMATED_TIMES[modelType]
    ?? DEFAULT_FALLBACK_ESTIMATED_TIME
})

// 进度条：当前时间（定时更新）
const now = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

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

onUnmounted(() => {
  if (progressTimer) clearInterval(progressTimer)
})

// 进度百分比
const progressPercent = computed(() => {
  if (!isLoading.value) return 0
  const start = new Date(props.task.createdAt).getTime()
  const elapsed = (now.value - start) / 1000
  const bufferedTime = estimatedTime.value * PROGRESS_TIME_BUFFER_RATIO
  return Math.min((elapsed / bufferedTime) * 100, 100)
})

// 计算耗时
const duration = computed(() => {
  if (!props.task.createdAt) return null
  const start = new Date(props.task.createdAt).getTime()
  const end = props.task.status === 'success' || props.task.status === 'failed'
    ? new Date(props.task.updatedAt).getTime()
    : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${minutes}分${remainSeconds}秒`
})

// 删除确认
const showDeleteConfirm = ref(false)

function handleRemove() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  showDeleteConfirm.value = false
  emit('remove')
}

// 视频预览
const showVideoPreview = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)

// 点击视频区域切换模糊状态
function handleVideoClick() {
  toggleBlur(!isBlurred.value)
}

// 查看参考图
const showRefImages = ref(false)

// 是否有参考图
const hasRefImages = computed(() => props.task.images && props.task.images.length > 0)

// 任务详情
const showTaskDetail = ref(false)

// 下载视频
function downloadVideo() {
  if (!props.task.resourceUrl) return
  const a = document.createElement('a')
  a.href = props.task.resourceUrl
  a.download = `video-${props.task.id}.mp4`
  a.target = '_blank'
  a.click()
}

// 错误详情
const showErrorDetailModal = ref(false)
const errorLogs = ref<{ requests: any[]; responses: any[] } | null>(null)
const loadingErrorLogs = ref(false)

async function showErrorDetail() {
  loadingErrorLogs.value = true
  showErrorDetailModal.value = true

  try {
    const logs = await $fetch<{ requests: any[]; responses: any[] }>(`/api/tasks/${props.task.id}/logs`)
    errorLogs.value = logs
  } catch (error: any) {
    if (error?.statusCode === 404) {
      errorLogs.value = null
      toast.add({ title: '无详情', description: '此错误无响应日志', color: 'warning' })
      showErrorDetailModal.value = false
    }
  } finally {
    loadingErrorLogs.value = false
  }
}
</script>

<template>
  <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-xl border border-(--ui-border) overflow-hidden">
    <!-- 视频预览 -->
    <div class="aspect-square relative bg-(--ui-bg-muted)">
      <!-- 已生成的视频 -->
      <video
        v-if="task.resourceUrl"
        ref="videoRef"
        :src="task.resourceUrl"
        class="w-full h-full object-contain cursor-pointer transition-all duration-300"
        :class="isBlurred ? 'blur-xl scale-105' : ''"
        controls
        preload="metadata"
        @click.stop="handleVideoClick"
      />

      <!-- 生成中状态 -->
      <div
        v-else
        class="w-full h-full flex items-center justify-center p-4"
      >
        <div class="text-center">
          <!-- 竖线加载动画 -->
          <StudioLoader
            v-if="statusInfo.showBars"
            :class="['w-12 h-12 mb-2', statusInfo.color]"
          />
          <!-- 图标 -->
          <UIcon
            v-else-if="statusInfo.icon"
            :name="statusInfo.icon"
            :class="['w-12 h-12 mb-2', statusInfo.color]"
          />
          <p :class="['text-sm mb-2', statusInfo.color]">{{ statusInfo.text }}</p>
          <!-- 失败时显示错误信息 -->
          <p v-if="task.error" class="text-(--ui-error) text-xs leading-relaxed line-clamp-3 px-2 mb-2">
            {{ task.error }}
          </p>
          <!-- 查看详情按钮 -->
          <button
            v-if="task.error && task.status === 'failed'"
            class="text-xs text-(--ui-text-muted) hover:text-(--ui-text) underline underline-offset-2"
            @click="showErrorDetail"
          >
            查看详情
          </button>
        </div>
      </div>

      <!-- 取消按钮（进行中状态） -->
      <div
        v-if="['pending', 'submitting', 'processing'].includes(task.status)"
        class="absolute bottom-12 left-0 right-0 flex justify-center"
      >
        <button
          class="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white/80 text-sm hover:bg-(--ui-warning)/70 transition-colors"
          @click="emit('cancel')"
        >
          <UIcon name="i-heroicons-stop" class="w-4 h-4 inline mr-1" />
          取消任务
        </button>
      </div>

      <!-- 状态角标 -->
      <div
        v-if="task.resourceUrl && task.status !== 'success'"
        class="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm"
      >
        <span :class="['text-xs', statusInfo.color]">{{ statusInfo.text }}</span>
      </div>

      <!-- 左上角按钮组 -->
      <div class="absolute top-2 left-2 flex gap-1">
        <!-- 下载按钮 -->
        <button
          v-if="task.resourceUrl"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="下载视频"
          @click="downloadVideo"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 全屏查看按钮 -->
        <button
          v-if="task.resourceUrl"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="全屏查看"
          @click="showVideoPreview = true"
        >
          <UIcon name="i-heroicons-arrows-pointing-out" class="w-4 h-4 text-white" />
        </button>
        <!-- 重试按钮 -->
        <button
          v-if="task.status === 'failed' || task.status === 'cancelled'"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="重试"
          @click="emit('retry')"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-white" />
        </button>
        <!-- 详情按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="详情"
          @click="showTaskDetail = true"
        >
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-white" />
        </button>
        <!-- 复制到工作台按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="复制到工作台"
          @click="emit('copyToPanel', task.prompt, task.images)"
        >
          <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4 text-white" />
        </button>
        <!-- 删除按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-(--ui-error)/70 transition-colors"
          title="删除"
          @click="handleRemove"
        >
          <UIcon name="i-heroicons-trash" class="w-4 h-4 text-white" />
        </button>
      </div>

      <!-- 模型标签 + 视频标识 -->
      <div class="absolute bottom-2 left-2 flex gap-1.5">
        <div
          class="px-2 py-1 rounded-full text-xs text-white font-medium"
          :class="modelInfo.color"
        >
          {{ modelInfo.label }}
        </div>
        <div class="px-2 py-1 rounded-full text-xs text-white font-medium bg-indigo-500/80">
          <UIcon name="i-heroicons-video-camera" class="w-3 h-3 inline mr-0.5" />
          视频
        </div>
      </div>

      <!-- 参考图角标 -->
      <button
        v-if="hasRefImages"
        class="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs text-white font-medium bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors flex items-center gap-1"
        title="查看参考图"
        @click="showRefImages = true"
      >
        <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
        <span>参考图</span>
      </button>

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

    <!-- 信息区 -->
    <div class="p-4">
      <!-- 任务ID和时间信息 -->
      <div class="flex items-center justify-between text-(--ui-text-dimmed) text-xs mb-2">
        <div class="flex items-center gap-2">
          <span
            class="font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded cursor-pointer hover:bg-(--ui-bg-inverted)/20 select-none"
            title="点击复制"
            @click="copyTaskId"
          >ID:{{ task.id }}</span>
          <TimeAgo :time="task.createdAt" />
        </div>
        <span v-if="duration">耗时 {{ duration }}</span>
      </div>

      <!-- 提示词 -->
      <p class="text-(--ui-text-muted) text-sm line-clamp-2" :title="task.prompt ?? ''">
        <span class="text-(--ui-text-dimmed)">提示词：</span>{{ task.prompt || '无' }}
      </p>
    </div>

    <!-- 删除确认 Modal -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定要删除这个任务吗？此操作不可撤销。" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 任务详情 Modal -->
    <UModal v-model:open="showTaskDetail" title="任务详情">
      <template #body>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">任务ID</span>
            <span class="font-mono text-(--ui-text)">{{ task.id }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">任务类型</span>
            <span class="text-(--ui-text)">视频生成</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">上游</span>
            <span class="text-(--ui-text)">{{ task.upstream?.name || '未知' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">模型类型</span>
            <span class="text-(--ui-text)">{{ modelInfo.label }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">请求格式</span>
            <span class="text-(--ui-text)">{{ API_FORMAT_LABELS[task.apiFormat] || task.apiFormat }}</span>
          </div>
          <div v-if="task.modelName" class="flex justify-between">
            <span class="text-(--ui-text-muted)">模型名称</span>
            <span class="text-(--ui-text) font-mono text-xs">{{ task.modelName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">状态</span>
            <span :class="statusInfo.color">{{ statusInfo.text }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-(--ui-text-muted)">创建时间</span>
            <span class="text-(--ui-text)">{{ new Date(task.createdAt).toLocaleString('zh-CN') }}</span>
          </div>
          <div v-if="duration" class="flex justify-between">
            <span class="text-(--ui-text-muted)">耗时</span>
            <span class="text-(--ui-text)">{{ duration }}</span>
          </div>
          <div v-if="task.upstreamTaskId" class="flex justify-between">
            <span class="text-(--ui-text-muted)">上游任务ID</span>
            <span class="font-mono text-xs text-(--ui-text)">{{ task.upstreamTaskId }}</span>
          </div>
          <div v-if="task.prompt">
            <span class="text-(--ui-text-muted) block mb-1">提示词</span>
            <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ task.prompt }}</p>
          </div>
          <div v-if="task.error">
            <span class="text-(--ui-text-muted) block mb-1">错误信息</span>
            <p class="text-(--ui-error) bg-(--ui-error)/10 rounded p-2 text-xs break-all">{{ task.error }}</p>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 视频全屏预览 Modal -->
    <UModal v-model:open="showVideoPreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-black flex items-center justify-center">
          <video
            v-if="task.resourceUrl"
            :src="task.resourceUrl"
            class="max-h-[85vh] w-full"
            controls
            autoplay
          />
          <!-- 关闭按钮 -->
          <button
            class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            @click="showVideoPreview = false"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-white" />
          </button>
          <!-- 下载按钮 -->
          <button
            class="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            title="下载视频"
            @click="downloadVideo"
          >
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-white" />
          </button>
        </div>
      </template>
    </UModal>

    <!-- 参考图预览 Modal -->
    <UModal v-model:open="showRefImages" title="参考图" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div class="grid gap-4" :class="task.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <div
            v-for="(img, index) in task.images"
            :key="index"
            class="relative bg-(--ui-bg-muted) rounded-lg overflow-hidden"
          >
            <img
              :src="img"
              :alt="`参考图 ${index + 1}`"
              class="w-full h-auto max-h-[60vh] object-contain"
            />
            <div class="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs text-white">
              {{ index + 1 }} / {{ task.images.length }}
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 错误详情 Modal -->
    <UModal v-model:open="showErrorDetailModal" title="错误详情" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <!-- 加载中 -->
        <div v-if="loadingErrorLogs" class="text-center py-8">
          <StudioLoader class="w-8 h-8 mx-auto mb-2 text-(--ui-primary)" />
          <p class="text-(--ui-text-muted) text-sm">加载中...</p>
        </div>

        <!-- 日志内容 -->
        <div v-else-if="errorLogs" class="space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- 遍历所有请求/响应对 -->
          <div v-for="(response, index) in errorLogs.responses" :key="index" class="space-y-3">
            <h4 class="text-sm font-medium text-(--ui-text-muted)">
              请求 {{ index + 1 }} / {{ errorLogs.responses.length }}
              <span class="text-xs text-(--ui-text-dimmed) ml-2">{{ response.timestamp }}</span>
            </h4>

            <!-- 请求信息 -->
            <div v-if="errorLogs.requests[index]" class="bg-(--ui-bg-muted) rounded-lg p-3 space-y-2">
              <div class="flex items-center gap-2 text-sm">
                <span class="font-mono text-(--ui-info)">{{ errorLogs.requests[index].method }}</span>
                <span class="font-mono text-(--ui-text) text-xs break-all">{{ errorLogs.requests[index].url }}</span>
              </div>
            </div>

            <!-- 响应信息 -->
            <div class="bg-(--ui-bg-muted) rounded-lg p-3 space-y-3">
              <!-- 状态码 -->
              <div class="flex items-center gap-2 text-sm">
                <span class="text-(--ui-text-muted)">状态码</span>
                <span
                  class="font-mono font-medium"
                  :class="response.status >= 400 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
                >
                  {{ response.status }} {{ response.statusText }}
                </span>
              </div>
              <!-- 响应体 -->
              <div>
                <span class="text-(--ui-text-muted) text-sm block mb-1">响应内容</span>
                <pre class="bg-(--ui-bg) rounded p-2 text-xs overflow-x-auto max-h-48 text-(--ui-text)">{{ JSON.stringify(response.data, null, 2) }}</pre>
              </div>
            </div>

            <!-- 分隔线 -->
            <hr v-if="index < errorLogs.responses.length - 1" class="border-(--ui-border)" />
          </div>
        </div>

        <!-- 无日志 -->
        <div v-else class="text-center py-8">
          <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 mx-auto mb-2 text-(--ui-text-dimmed)" />
          <p class="text-(--ui-text-muted) text-sm">无日志记录</p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import type { ImageModelType, ImageModelParams } from '../../shared/types'
import { formatDuration } from '~/composables/useTimeFormat'
import { getCardDisplay } from '../../shared/registry'
import {
  DEFAULT_FALLBACK_ESTIMATED_TIME,
  PROGRESS_UPDATE_INTERVAL_MS,
  PROGRESS_TIME_BUFFER_RATIO,
} from '../../shared/constants'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  action: [customId: string]
  remove: []
  retry: []
  cancel: []
  blur: [isBlurred: boolean]
  copyToPanel: [prompt: string | null, modelParams: ImageModelParams | null, images: string[]]
}>()

const isActioning = ref(false)

const toast = useToast()

// 复制任务ID
async function copyTaskId() {
  const taskId = String(props.task.id)
  try {
    await navigator.clipboard.writeText(taskId)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  } catch {
    // fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = taskId
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  }
}

// 图片模糊状态（防窥屏）- 从任务数据初始化
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
  const modelType = props.task.modelType as ImageModelType
  const display = getCardDisplay(modelType) || { label: modelType || '未知', color: 'bg-gray-500/80' }

  return {
    label: props.task.upstream?.aimodelName || display.label,  // 优先使用 aimodelName
    type: modelType,
    color: display.color,
  }
})

// 是否显示加载动画
const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(props.task.status))

// 获取当前任务的预计时间（秒）（使用共享常量 DEFAULT_FALLBACK_ESTIMATED_TIME）
const estimatedTime = computed(() => {
  return props.task.upstream?.estimatedTime ?? DEFAULT_FALLBACK_ESTIMATED_TIME
})

// 进度条：当前时间（定时更新）
const now = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

// 启动/停止进度条计时器（使用共享常量 PROGRESS_UPDATE_INTERVAL_MS）
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

// 进度百分比（使用共享常量 PROGRESS_TIME_BUFFER_RATIO 作为时长缓冲系数）
const progressPercent = computed(() => {
  if (!isLoading.value) return 0
  const start = new Date(props.task.createdAt).getTime()
  const elapsed = (now.value - start) / 1000
  const bufferedTime = estimatedTime.value * PROGRESS_TIME_BUFFER_RATIO
  return Math.min((elapsed / bufferedTime) * 100, 100)
})

// 格式化耗时显示（仅在任务完成时显示）
const duration = computed(() => {
  if (!['success', 'failed'].includes(props.task.status)) return null
  return formatDuration(props.task.duration!)
})

// 按钮列表（处理null）
const buttons = computed(() => props.task.buttons ?? [])

// 下拉菜单项（分组：放大、变体、重绘）
const dropdownItems = computed(() => {
  const items: any[][] = []

  // 放大 U1-U4
  const upscaleButtons = buttons.value.filter(btn => btn.label.startsWith('U'))
  if (upscaleButtons.length > 0) {
    items.push([
      { label: '放大', type: 'label' },
      ...upscaleButtons.map(btn => ({
        label: btn.label,
        icon: 'i-heroicons-arrows-pointing-out',
        onSelect: () => handleAction(btn.customId)
      }))
    ])
  }

  // 变体 V1-V4
  const variationButtons = buttons.value.filter(btn => btn.label.startsWith('V'))
  if (variationButtons.length > 0) {
    items.push([
      { label: '变体', type: 'label' },
      ...variationButtons.map(btn => ({
        label: btn.label,
        icon: 'i-heroicons-sparkles',
        onSelect: () => handleAction(btn.customId)
      }))
    ])
  }

  // 重绘
  const rerollButton = buttons.value.find(btn => btn.emoji === '🔄')
  if (rerollButton) {
    items.push([
      {
        label: '重绘',
        icon: 'i-heroicons-arrow-path',
        onSelect: () => handleAction(rerollButton.customId)
      }
    ])
  }

  return items
})

// 执行按钮动作
async function handleAction(customId: string) {
  isActioning.value = true
  try {
    emit('action', customId)
  } finally {
    isActioning.value = false
  }
}

// 删除确认
const showDeleteConfirm = ref(false)

function handleRemove() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  showDeleteConfirm.value = false
  emit('remove')
}

// 查看大图
const showImagePreview = ref(false)

// 点击图片切换模糊状态
function handleImageClick() {
  toggleBlur(!isBlurred.value)
}

// 是否有参考图
const hasRefImages = computed(() => props.task.images && props.task.images.length > 0)

// 任务详情弹窗
const showTaskDetail = ref(false)

// 参考图预览弹窗
const showRefImages = ref(false)

// 下载图片
function downloadImage() {
  if (!props.task.resourceUrl) return

  // 从 URL 中提取原文件名
  const urlPath = props.task.resourceUrl.split('?')[0] // 移除查询参数
  const originalFileName = urlPath?.split('/').pop() || `mj-${props.task.id}.png`

  const a = document.createElement('a')
  a.href = props.task.resourceUrl
  a.download = originalFileName
  a.target = '_blank'
  a.click()
}

</script>

<template>
  <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-lg border border-(--ui-border) overflow-hidden">
    <!-- 图片预览 -->
    <div class="aspect-square relative" :class="task.resourceUrl && !isBlurred ? 'checkerboard-bg' : 'bg-(--ui-bg-muted)'">
      <img
        v-if="task.resourceUrl"
        :src="task.resourceUrl"
        :alt="task.prompt ?? ''"
        class="w-full h-full object-contain cursor-pointer transition-all duration-300"
        :class="isBlurred ? 'blur-xl scale-105' : ''"
        @click="handleImageClick"
      />
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
          <p v-if="task.error" class="text-(--ui-error) text-xs leading-relaxed line-clamp-3 px-2">
            {{ task.error }}
          </p>
        </div>
      </div>

      <!-- 取消按钮（进行中状态，底部居中显示） -->
      <div
        v-if="['pending', 'submitting', 'processing'].includes(task.status)"
        class="absolute bottom-16 left-0 right-0 flex justify-center"
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
          title="下载图片"
          @click="downloadImage"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 放大查看按钮 -->
        <button
          v-if="task.resourceUrl"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="放大查看"
          @click="showImagePreview = true"
        >
          <UIcon name="i-heroicons-magnifying-glass-plus" class="w-4 h-4 text-white" />
        </button>
        <!-- MJ操作按钮 -->
        <UDropdownMenu v-if="modelInfo.type === 'midjourney' && buttons.length > 0" :items="dropdownItems">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            title="MJ操作"
            :disabled="isActioning"
          >
            <UIcon name="i-heroicons-squares-plus" class="w-4 h-4 text-white" />
          </button>
        </UDropdownMenu>
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
          @click="emit('copyToPanel', task.prompt, task.modelParams as ImageModelParams | null, task.images)"
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

      <!-- 模型标签 -->
      <div
        class="absolute bottom-2 left-2 px-2 py-1 rounded-full text-xs text-white font-medium"
        :class="modelInfo.color"
      >
        {{ modelInfo.label }}
      </div>

      <!-- 参考图角标 -->
      <button
        v-if="hasRefImages"
        class="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs text-white font-medium bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors flex items-center gap-1"
        title="查看参考图"
        @click="showRefImages = true"
      >
        <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
        <span>参考图 {{ task.images.length }}</span>
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
      <p class="text-(--ui-text-muted) text-sm line-clamp-2 mb-3" :title="task.prompt ?? ''">
        <span class="text-(--ui-text-dimmed)">提示词：</span>{{ task.prompt || '图片混合' }}
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
    <StudioTaskDetailModal v-model:open="showTaskDetail" :task="task" />

    <!-- 大图预览 Modal -->
    <UModal v-model:open="showImagePreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-(--ui-bg) flex items-center justify-center">
          <img
            v-if="task.resourceUrl"
            :src="task.resourceUrl"
            :alt="task.prompt ?? ''"
            class="max-h-[85vh]"
          />
          <!-- 关闭按钮 -->
          <button
            class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            @click="showImagePreview = false"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-white" />
          </button>
          <!-- 下载按钮 -->
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

    <!-- 参考图预览 Modal -->
    <StudioRefImagesModal v-model:open="showRefImages" :images="task.images" />
  </div>
</template>

<style scoped>
.checkerboard-bg {
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: #fff;
}

:root.dark .checkerboard-bg {
  background-image:
    linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
    linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
    linear-gradient(-45deg, transparent 75%, #3a3a3a 75%);
  background-color: #2a2a2a;
}
</style>

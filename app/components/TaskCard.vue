<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import { encodeTaskId } from '~/utils/sqids'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  action: [customId: string]
  remove: []
  retry: []
}>()

const isActioning = ref(false)

const toast = useToast()

// 任务ID（编码后的短字符串）
const taskSqid = computed(() => encodeTaskId(props.task.id))

// 复制任务ID
async function copyTaskId() {
  try {
    await navigator.clipboard.writeText(taskSqid.value)
    toast.add({ title: '已复制', description: `ID:${taskSqid.value}`, color: 'success' })
  } catch {
    // fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = taskSqid.value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    toast.add({ title: '已复制', description: `ID:${taskSqid.value}`, color: 'success' })
  }
}

// 图片模糊状态（防窥屏）- 从任务数据初始化
const isBlurred = ref(props.task.isBlurred ?? true)

// 切换模糊状态并同步到后端
async function toggleBlur(blur: boolean) {
  isBlurred.value = blur
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
      return { text: '等待中', color: 'text-yellow-400', icon: 'i-heroicons-clock', showBars: false }
    case 'submitting':
      return { text: '提交中', color: 'text-orange-400', icon: null, showBars: true }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-blue-400', icon: null, showBars: true }
    case 'success':
      return { text: '已完成', color: 'text-green-400', icon: 'i-heroicons-check-circle', showBars: false }
    case 'failed':
      return { text: '失败', color: 'text-red-400', icon: 'i-heroicons-x-circle', showBars: false }
    default:
      return { text: '未知', color: 'text-gray-400', icon: 'i-heroicons-question-mark-circle', showBars: false }
  }
})

// 获取模型显示信息
const modelInfo = computed(() => {
  const modelType = props.task.modelType

  // 优先按模型类型显示，而非上游配置名称
  return {
    label: modelType === 'gemini' ? 'Gemini' : 'MJ',
    type: modelType,
    color: modelType === 'gemini' ? 'bg-blue-500/80' : 'bg-purple-500/80'
  }
})

// 是否显示加载动画
const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(props.task.status))

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

// 按钮列表（处理null）
const buttons = computed(() => props.task.buttons ?? [])

// 解析按钮类型
function getButtonInfo(customId: string, label: string, emoji: string) {
  if (label.startsWith('U')) {
    return { type: 'upscale', variant: 'solid' as const, color: 'primary' as const }
  }
  if (label.startsWith('V')) {
    return { type: 'variation', variant: 'outline' as const, color: 'secondary' as const }
  }
  if (emoji === '🔄') {
    return { type: 'reroll', variant: 'ghost' as const, color: 'neutral' as const }
  }
  return { type: 'other', variant: 'ghost' as const, color: 'neutral' as const }
}

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

// 下载图片
function downloadImage() {
  if (!props.task.imageUrl) return
  const a = document.createElement('a')
  a.href = props.task.imageUrl
  a.download = `mj-${props.task.id}.png`
  a.target = '_blank'
  a.click()
}
</script>

<template>
  <div class="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
    <!-- 图片预览 -->
    <div class="aspect-square bg-black/20 relative">
      <img
        v-if="task.imageUrl"
        :src="task.imageUrl"
        :alt="task.prompt ?? ''"
        class="w-full h-full object-contain cursor-pointer transition-all duration-300"
        :class="isBlurred ? 'blur-xl scale-105' : ''"
        @click="toggleBlur(false)"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center p-4"
      >
        <div class="text-center">
          <!-- 竖线加载动画 -->
          <BarsLoader
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
          <p v-if="task.error" class="text-red-400/80 text-xs leading-relaxed break-all">
            {{ task.error }}
          </p>
        </div>
      </div>

      <!-- 点击提示（模糊状态） -->
      <div
        v-if="task.imageUrl && isBlurred"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div class="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white/80 text-sm">
          <UIcon name="i-heroicons-eye" class="w-4 h-4 inline mr-1" />
          点击查看
        </div>
      </div>

      <!-- 状态角标 -->
      <div
        v-if="task.imageUrl && task.status !== 'success'"
        class="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm"
      >
        <span :class="['text-xs', statusInfo.color]">{{ statusInfo.text }}</span>
      </div>

      <!-- 左上角按钮组 -->
      <div class="absolute top-2 left-2 flex gap-1">
        <!-- 下载按钮 -->
        <button
          v-if="task.imageUrl"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="下载图片"
          @click="downloadImage"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 恢复模糊按钮 -->
        <button
          v-if="task.imageUrl && !isBlurred"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="隐藏图片"
          @click="toggleBlur(true)"
        >
          <UIcon name="i-heroicons-eye-slash" class="w-4 h-4 text-white" />
        </button>
        <!-- 重试按钮 -->
        <button
          v-if="task.status === 'failed'"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="重试"
          @click="emit('retry')"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-white" />
        </button>
        <!-- 删除按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-red-500/70 transition-colors"
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
    </div>

    <!-- 信息区 -->
    <div class="p-4">
      <!-- 任务ID和时间信息 -->
      <div class="flex items-center justify-between text-white/40 text-xs mb-2">
        <div class="flex items-center gap-2">
          <span
            class="font-mono bg-white/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/20 select-none"
            title="点击复制"
            @click="copyTaskId"
          >ID:{{ taskSqid }}</span>
          <span>{{ formatTime(task.createdAt) }}</span>
        </div>
        <span v-if="duration">耗时 {{ duration }}</span>
      </div>

      <!-- 提示词 -->
      <p class="text-white/70 text-sm line-clamp-2 mb-3" :title="task.prompt ?? ''">
        <span class="text-white/50">提示词：</span>{{ task.prompt || '图片混合' }}
      </p>

      <!-- 操作按钮 (仅MJ任务有) -->
      <div v-if="modelInfo.type === 'midjourney' && buttons.length > 0" class="flex flex-wrap gap-2">
        <UButton
          v-for="btn in buttons.slice(0, 9)"
          :key="btn.customId"
          size="xs"
          :variant="getButtonInfo(btn.customId, btn.label, btn.emoji).variant"
          :color="getButtonInfo(btn.customId, btn.label, btn.emoji).color"
          :disabled="isActioning"
          @click="handleAction(btn.customId)"
        >
          {{ btn.emoji || btn.label }}
        </UButton>
      </div>
    </div>

    <!-- 删除确认 Modal -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6 text-center">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-(--ui-warning) mx-auto mb-4" />
          <h3 class="text-lg font-medium text-(--ui-text) mb-2">确认删除</h3>
          <p class="text-(--ui-text-muted) text-sm mb-6">确定要删除这个任务吗？此操作不可撤销。</p>
          <div class="flex justify-center gap-3">
            <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
            <UButton color="error" @click="confirmDelete">删除</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

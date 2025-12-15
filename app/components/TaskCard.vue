<script setup lang="ts">
import type { Task } from '~/composables/useTasks'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  action: [customId: string]
  remove: []
  retry: []
}>()

const isActioning = ref(false)

// 获取状态显示
const statusInfo = computed(() => {
  switch (props.task.status) {
    case 'pending':
      return { text: '等待中', color: 'text-yellow-400', icon: 'i-heroicons-clock', spin: false }
    case 'submitting':
      return { text: '提交中', color: 'text-orange-400', icon: 'i-heroicons-arrow-up-tray', spin: true }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-blue-400', icon: 'i-heroicons-arrow-path', spin: true }
    case 'success':
      return { text: '已完成', color: 'text-green-400', icon: 'i-heroicons-check-circle', spin: false }
    case 'failed':
      return { text: '失败', color: 'text-red-400', icon: 'i-heroicons-x-circle', spin: false }
    default:
      return { text: '未知', color: 'text-gray-400', icon: 'i-heroicons-question-mark-circle', spin: false }
  }
})

// 获取模型显示信息
const modelInfo = computed(() => {
  const config = props.task.modelConfig
  const modelType = props.task.modelType

  return {
    label: config?.name || (modelType === 'gemini' ? 'Gemini' : 'MJ'),
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
function handleRemove() {
  if (confirm('确定要删除这个任务吗？')) {
    emit('remove')
  }
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
        class="w-full h-full object-contain"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center"
      >
        <div class="text-center">
          <UIcon
            :name="statusInfo.icon"
            :class="['w-12 h-12 mb-2', statusInfo.color, statusInfo.spin ? 'animate-spin' : '']"
          />
          <p :class="['text-sm', statusInfo.color]">{{ statusInfo.text }}</p>
        </div>
      </div>

      <!-- 状态角标 -->
      <div
        v-if="task.imageUrl && task.status !== 'success'"
        class="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm"
      >
        <span :class="['text-xs', statusInfo.color]">{{ statusInfo.text }}</span>
      </div>

      <!-- 下载按钮 -->
      <button
        v-if="task.imageUrl"
        class="absolute top-2 left-2 p-2 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
        title="下载图片"
        @click="downloadImage"
      >
        <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
      </button>

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
      <!-- 时间信息 -->
      <div class="flex items-center justify-between text-white/40 text-xs mb-2">
        <span>{{ formatTime(task.createdAt) }}</span>
        <span v-if="duration">耗时 {{ duration }}</span>
      </div>

      <!-- 提示词 -->
      <p class="text-white/70 text-sm line-clamp-2 mb-3" :title="task.prompt ?? ''">
        <span class="text-white/50">提示词：</span>{{ task.prompt || '图片混合' }}
      </p>

      <!-- 失败原因 -->
      <p v-if="task.error" class="text-red-400 text-xs mb-3">
        {{ task.error }}
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

      <!-- 删除按钮 -->
      <div class="mt-3 flex justify-end gap-2">
        <UButton
          v-if="task.status === 'failed'"
          size="xs"
          variant="outline"
          color="primary"
          @click="emit('retry')"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
          重试
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          color="error"
          @click="handleRemove"
        >
          <UIcon name="i-heroicons-trash" class="w-4 h-4" />
        </UButton>
      </div>
    </div>
  </div>
</template>

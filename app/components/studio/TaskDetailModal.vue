<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import type { ImageModelType, VideoModelType } from '../../shared/types'
import { getCardDisplay, getApiFormatLabel } from '../../shared/registry'

const props = defineProps<{
  task: Task
}>()

const open = defineModel<boolean>('open', { default: false })

// 获取模型显示信息
const modelInfo = computed(() => {
  const modelType = props.task.modelType as ImageModelType | VideoModelType
  const display = getCardDisplay(modelType) || { label: modelType || '未知', color: 'bg-gray-500/80' }
  return {
    label: display.label,
    type: modelType,
    color: display.color,
  }
})

// 获取状态显示
const statusInfo = computed(() => {
  switch (props.task.status) {
    case 'pending':
      return { text: '等待中', color: 'text-(--ui-warning)' }
    case 'submitting':
      return { text: '提交中', color: 'text-(--ui-info)' }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-(--ui-primary)' }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)' }
    case 'failed':
      return { text: '失败', color: 'text-(--ui-error)' }
    case 'cancelled':
      return { text: '已取消', color: 'text-(--ui-text-muted)' }
    default:
      return { text: '未知', color: 'text-(--ui-text-muted)' }
  }
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

// 任务类型显示
const taskTypeLabel = computed(() => {
  if (props.task.taskType === 'video') {
    return '视频生成'
  }
  return props.task.type === 'blend' ? '图片混合' : '文生图'
})
</script>

<template>
  <UModal v-model:open="open" title="任务详情">
    <template #body>
      <div class="space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">任务ID</span>
          <span class="font-mono text-(--ui-text)">{{ task.id }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">任务类型</span>
          <span class="text-(--ui-text)">{{ taskTypeLabel }}</span>
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
          <span class="text-(--ui-text)">{{ getApiFormatLabel(task.apiFormat) }}</span>
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
        <div v-if="task.modelParams">
          <span class="text-(--ui-text-muted) block mb-1">模型参数</span>
          <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ JSON.stringify(task.modelParams) }}</p>
        </div>
        <div v-if="task.error">
          <span class="text-(--ui-text-muted) block mb-1">错误信息</span>
          <p class="text-(--ui-error) bg-(--ui-error)/10 rounded p-2 text-xs break-all">{{ task.error }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>

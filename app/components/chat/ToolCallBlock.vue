<script setup lang="ts">
/**
 * ToolCallBlock - MCP 工具调用展示组件
 *
 * 显示 MCP 工具调用的状态、参数和结果
 * - pending: 等待用户确认（显示批准/拒绝按钮）
 * - invoking: 正在执行（显示加载动画）
 * - done: 执行完成（可折叠显示结果）
 * - error: 执行出错（显示错误信息）
 * - cancelled: 已取消
 *
 * 状态化重构：
 * - 组件只接收 messageId 和 toolCallId（以及初始数据用于首次渲染）
 * - 挂载时从后端查询最新状态
 * - 订阅 SSE 事件实时更新状态
 */

import type { ToolCallStatusUpdated, ToolCallEventStatus } from '~/composables/useGlobalEvents'

export interface ToolCallBlockData {
  id: string
  toolUseId: string
  serverName: string
  toolName: string
  status: ToolCallEventStatus
  arguments: Record<string, unknown>
  response?: unknown
  isError?: boolean
}

const props = defineProps<{
  /** 初始数据（用于首次渲染，避免闪烁） */
  data: ToolCallBlockData
  /** 消息 ID（必须提供才能查询状态和订阅事件） */
  messageId?: number
}>()

// 内部状态（从 SSE 事件更新）
const status = ref<ToolCallEventStatus>(props.data.status)
const serverName = ref(props.data.serverName)
const toolName = ref(props.data.toolName)
const args = ref<Record<string, unknown>>(props.data.arguments)
const response = ref<unknown>(props.data.response)
const isError = ref(props.data.isError)

// 展开/收起状态
const isExpanded = ref(false)
const isArgumentsExpanded = ref(false)

// 确认操作状态
const isConfirming = ref(false)

// 订阅 SSE 事件
const { on } = useGlobalEvents()

onMounted(async () => {
  // 订阅工具调用状态更新事件
  on<ToolCallStatusUpdated>('tool.call.status.updated', (data) => {
    // 只处理当前工具调用的事件
    if (data.messageId === props.messageId && data.toolCallId === props.data.id) {
      status.value = data.status
      if (data.serverName) serverName.value = data.serverName
      if (data.toolName) toolName.value = data.toolName
      if (data.arguments) args.value = data.arguments
      if (data.response !== undefined) response.value = data.response
      if (data.isError !== undefined) isError.value = data.isError
    }
  })

  // 挂载时查询最新状态（仅当有 messageId 时）
  if (props.messageId) {
    try {
      const result = await $fetch<{
        status: ToolCallEventStatus
        serverName?: string
        toolName?: string
        arguments?: Record<string, unknown>
        response?: unknown
        isError?: boolean
      }>(`/api/messages/${props.messageId}/tool-calls/${props.data.id}`)

      // 更新状态
      status.value = result.status
      if (result.serverName) serverName.value = result.serverName
      if (result.toolName) toolName.value = result.toolName
      if (result.arguments) args.value = result.arguments
      if (result.response !== undefined) response.value = result.response
      if (result.isError !== undefined) isError.value = result.isError
    } catch (err) {
      // 查询失败时保持初始状态
      console.warn('查询工具调用状态失败:', err)
    }
  }
})

// 状态配置
const statusConfig = computed(() => {
  switch (status.value) {
    case 'pending':
      return {
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-950',
        borderColor: 'border-amber-200 dark:border-amber-800',
        icon: 'i-heroicons-clock',
        label: '等待确认',
      }
    case 'invoking':
      return {
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-950',
        borderColor: 'border-blue-200 dark:border-blue-800',
        icon: null, // 使用加载动画
        label: '执行中',
      }
    case 'done':
      return {
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-950',
        borderColor: 'border-green-200 dark:border-green-800',
        icon: 'i-heroicons-check-circle',
        label: '已完成',
      }
    case 'error':
      return {
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-950',
        borderColor: 'border-red-200 dark:border-red-800',
        icon: 'i-heroicons-exclamation-circle',
        label: '执行失败',
      }
    case 'cancelled':
      return {
        color: 'text-gray-500 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-gray-800',
        borderColor: 'border-gray-200 dark:border-gray-700',
        icon: 'i-heroicons-x-circle',
        label: '已取消',
      }
    default:
      return {
        color: 'text-(--ui-text-muted)',
        bgColor: 'bg-(--ui-bg-elevated)',
        borderColor: 'border-(--ui-border)',
        icon: 'i-heroicons-question-mark-circle',
        label: '未知状态',
      }
  }
})

// 格式化 JSON 显示
function formatJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

// 确认工具调用
async function handleConfirm(action: 'approve' | 'reject') {
  if (!props.messageId) return

  isConfirming.value = true
  try {
    await $fetch(`/api/messages/${props.messageId}/tool-confirm`, {
      method: 'POST',
      body: {
        toolCallId: props.data.id,
        action,
      },
    })
  } catch (err) {
    console.error('工具调用确认失败:', err)
  } finally {
    isConfirming.value = false
  }
}

// 是否有响应数据
const hasResponse = computed(() => {
  return response.value !== undefined && response.value !== null
})

// 是否有参数
const hasArguments = computed(() => {
  return args.value && Object.keys(args.value).length > 0
})
</script>

<template>
  <div
    class="tool-call-block my-3 rounded-lg border overflow-hidden"
    :class="[statusConfig.bgColor, statusConfig.borderColor]"
  >
    <!-- 头部：服务名、工具名、状态 -->
    <div class="px-4 py-2.5 flex items-center gap-3 border-b" :class="statusConfig.borderColor">
      <!-- 服务图标 -->
      <div class="w-8 h-8 rounded-lg bg-(--ui-bg-elevated) flex items-center justify-center flex-shrink-0">
        <UIcon name="i-heroicons-wrench-screwdriver" class="w-4 h-4 text-(--ui-text-muted)" />
      </div>

      <!-- 服务和工具信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-(--ui-text) truncate">{{ toolName }}</span>
          <span class="text-xs text-(--ui-text-muted)">@{{ serverName }}</span>
        </div>
      </div>

      <!-- 状态标签 -->
      <div class="flex items-center gap-1.5" :class="statusConfig.color">
        <!-- 加载动画（invoking 状态） -->
        <span v-if="status === 'invoking'" class="flex items-center gap-1">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" style="animation-delay: 0.2s" />
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" style="animation-delay: 0.4s" />
        </span>
        <!-- 状态图标 -->
        <UIcon v-else-if="statusConfig.icon" :name="statusConfig.icon" class="w-4 h-4" />
        <span class="text-xs font-medium">{{ statusConfig.label }}</span>
      </div>
    </div>

    <!-- 参数区域 -->
    <div v-if="hasArguments" class="border-b" :class="statusConfig.borderColor">
      <button
        class="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        @click="isArgumentsExpanded = !isArgumentsExpanded"
      >
        <UIcon
          :name="isArgumentsExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-3.5 h-3.5 text-(--ui-text-muted)"
        />
        <span class="text-xs text-(--ui-text-muted)">参数</span>
      </button>
      <div
        v-if="isArgumentsExpanded"
        class="px-4 pb-3"
      >
        <pre class="text-xs text-(--ui-text-muted) bg-(--ui-bg) rounded p-2 overflow-x-auto">{{ formatJson(args) }}</pre>
      </div>
    </div>

    <!-- 确认按钮（pending 状态） -->
    <div v-if="status === 'pending' && messageId" class="px-4 py-3 flex items-center gap-3">
      <span class="text-xs text-(--ui-text-muted) flex-1">是否允许执行此工具?</span>
      <UButton
        size="xs"
        color="primary"
        :loading="isConfirming"
        :disabled="isConfirming"
        @click="handleConfirm('approve')"
      >
        <UIcon name="i-heroicons-check" class="w-3.5 h-3.5 mr-1" />
        批准
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        :loading="isConfirming"
        :disabled="isConfirming"
        @click="handleConfirm('reject')"
      >
        <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 mr-1" />
        拒绝
      </UButton>
    </div>

    <!-- 结果区域（done/error 状态） -->
    <div v-if="(status === 'done' || status === 'error') && hasResponse">
      <button
        class="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        @click="isExpanded = !isExpanded"
      >
        <UIcon
          :name="isExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-3.5 h-3.5 text-(--ui-text-muted)"
        />
        <span class="text-xs" :class="status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-(--ui-text-muted)'">
          {{ status === 'error' ? '错误信息' : '执行结果' }}
        </span>
      </button>
      <div
        v-if="isExpanded"
        class="px-4 pb-3"
      >
        <pre
          class="text-xs rounded p-2 overflow-x-auto max-h-60"
          :class="status === 'error' ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' : 'text-(--ui-text-muted) bg-(--ui-bg)'"
        >{{ formatJson(response) }}</pre>
      </div>
    </div>
  </div>
</template>

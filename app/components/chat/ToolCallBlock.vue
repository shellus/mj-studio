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
 * - 组件接收 ToolCallRecord 和 messageId
 * - 订阅 tool.message.updated 事件实时更新状态
 */

import type { ToolCallRecord } from '~/shared/types'
import type { AssistantToolCallUpdated } from '~/composables/useGlobalEvents'

type ToolCallStatus = ToolCallRecord['status']

const props = defineProps<{
  /** 工具调用记录 */
  toolCall: ToolCallRecord
  /** 消息 ID（必须提供才能订阅事件） */
  messageId?: number
  /** 是否批准（仅在 pending 状态时使用） */
  approved?: boolean
}>()

// 内部状态（从 SSE 事件更新）
const status = ref<ToolCallStatus>(props.toolCall.status)
const serverName = ref(props.toolCall.serverName)
const toolName = ref(props.toolCall.toolName)
const args = ref<Record<string, unknown>>(props.toolCall.arguments)
const response = ref<unknown>(props.toolCall.response)
const isError = ref(props.toolCall.isError)

// 展开/收起状态（默认折叠）
const isExpanded = ref(false)

// 定义 emits
const emit = defineEmits<{
  'update:approved': [value: boolean]
}>()

// 订阅 SSE 事件
const { on } = useGlobalEvents()

onMounted(() => {
  // 订阅 assistant.toolCall.updated 事件（精细粒度）
  on<AssistantToolCallUpdated>('assistant.toolCall.updated', (data) => {
    // 只处理当前消息和当前工具调用的事件
    if (data.messageId !== props.messageId) return
    if (data.toolCallId !== props.toolCall.id) return

    const updatedToolCall = data.toolCall
    status.value = updatedToolCall.status
    serverName.value = updatedToolCall.serverName
    toolName.value = updatedToolCall.toolName
    args.value = updatedToolCall.arguments
    if (updatedToolCall.response !== undefined) {
      response.value = updatedToolCall.response
    }
    if (updatedToolCall.isError !== undefined) {
      isError.value = updatedToolCall.isError
    }
  })
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

// 是否有响应数据
const hasResponse = computed(() => {
  return response.value !== undefined && response.value !== null
})

// 是否有参数
const hasArguments = computed(() => {
  return args.value && Object.keys(args.value).length > 0
})

// 从响应中提取图片 URL
const responseImageUrl = computed<string | null>(() => {
  if (!response.value || status.value !== 'done') return null
  try {
    // response 可能是 JSON 字符串或对象
    const data = typeof response.value === 'string' ? JSON.parse(response.value) : response.value
    if (data?.resourceUrl && typeof data.resourceUrl === 'string') {
      return data.resourceUrl
    }
  } catch {
    // 非 JSON 字符串，忽略
  }
  return null
})
</script>

<template>
  <div
    class="tool-call-block border-b last:border-b-0 overflow-hidden transition-all cursor-pointer"
    :class="[statusConfig.bgColor, statusConfig.borderColor]"
    @click="isExpanded = !isExpanded"
  >
    <!-- 折叠状态：单行显示 -->
    <div class="px-4 py-2.5 flex items-center gap-3">
      <!-- 展开/折叠图标 -->
      <UIcon
        :name="isExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
        class="w-4 h-4 text-(--ui-text-muted) flex-shrink-0"
      />

      <!-- 状态图标 -->
      <div class="flex items-center gap-1.5 flex-shrink-0" :class="statusConfig.color">
        <!-- 加载动画（invoking 状态） -->
        <span v-if="status === 'invoking'" class="flex items-center gap-1">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" style="animation-delay: 0.2s" />
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" style="animation-delay: 0.4s" />
        </span>
        <!-- 状态图标 -->
        <UIcon v-else-if="statusConfig.icon" :name="statusConfig.icon" class="w-4 h-4" />
      </div>

      <!-- 工具名称 -->
      <span class="text-sm font-medium text-(--ui-text) truncate">{{ toolName }}</span>

      <!-- 服务名称 -->
      <span class="text-xs text-(--ui-text-muted) flex-shrink-0">@{{ serverName }}</span>

      <!-- 状态标签 -->
      <span class="text-xs font-medium ml-auto flex-shrink-0" :class="statusConfig.color">
        {{ statusConfig.label }}
      </span>
    </div>

    <!-- 展开状态：详细信息 -->
    <div v-if="isExpanded" class="border-t" :class="statusConfig.borderColor" @click.stop>
      <!-- 参数区域 -->
      <div v-if="hasArguments" class="px-4 py-3 border-b" :class="statusConfig.borderColor">
        <div class="text-xs text-(--ui-text-muted) mb-2 font-medium">参数</div>
        <pre class="text-xs text-(--ui-text-muted) bg-(--ui-bg) rounded p-2 overflow-x-auto">{{ formatJson(args) }}</pre>
      </div>

      <!-- 批准开关（pending 状态） -->
      <div v-if="status === 'pending' && messageId" class="px-4 py-3 flex items-center gap-3 border-b" :class="statusConfig.borderColor">
        <span class="text-xs text-(--ui-text-muted) flex-1">是否允许执行</span>
        <USwitch
          :model-value="approved ?? true"
          @update:model-value="emit('update:approved', $event)"
        />
      </div>

      <!-- 结果区域（done/error 状态） -->
      <div v-if="(status === 'done' || status === 'error') && hasResponse" class="px-4 py-3">
        <div class="text-xs mb-2 font-medium" :class="status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-(--ui-text-muted)'">
          {{ status === 'error' ? '错误信息' : '执行结果' }}
        </div>
        <!-- 图片预览（检测到 resourceUrl 时显示） -->
        <div v-if="responseImageUrl" class="mb-2">
          <img
            :src="responseImageUrl"
            alt="生成的图片"
            class="max-w-full max-h-80 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            loading="lazy"
            @click.stop="navigateTo(responseImageUrl!, { open: { target: '_blank' } })"
          />
        </div>
        <pre
          class="text-xs rounded p-2 overflow-x-auto max-h-60"
          :class="status === 'error' ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' : 'text-(--ui-text-muted) bg-(--ui-bg)'"
        >{{ formatJson(response) }}</pre>
      </div>
    </div>
  </div>
</template>

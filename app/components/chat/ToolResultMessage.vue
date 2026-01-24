<script setup lang="ts">
/**
 * ToolResultMessage - 工具执行结果消息组件
 *
 * 用于渲染 role: 'tool' 的消息，显示工具执行结果
 * - 显示工具名称（从 toolCallData.toolName 获取）
 * - 显示执行状态（成功/失败，从 toolCallData.isError 获取）
 * - 可折叠显示结果内容（message.content）
 */

import type { Message } from '~/composables/useConversations'
import type { ToolCallData } from '~/shared/types'

const props = defineProps<{
  message: Message
}>()

// 展开/收起状态
const isExpanded = ref(false)

// 从 toolCallData 获取工具信息
const toolCallData = computed(() => {
  if (!props.message.toolCallData) return null
  return props.message.toolCallData as ToolCallData
})

// 工具名称
const toolName = computed(() => {
  if (toolCallData.value?.type === 'tool_result') {
    return toolCallData.value.toolName
  }
  return '未知工具'
})

// 是否执行出错
const isError = computed(() => {
  if (toolCallData.value?.type === 'tool_result') {
    return toolCallData.value.isError
  }
  return false
})

// 状态配置
const statusConfig = computed(() => {
  if (isError.value) {
    return {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: 'i-heroicons-exclamation-circle',
      label: '执行失败',
    }
  }
  return {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    borderColor: 'border-green-200 dark:border-green-800',
    icon: 'i-heroicons-check-circle',
    label: '执行成功',
  }
})

// 格式化内容显示
const formattedContent = computed(() => {
  const content = props.message.content
  if (!content) return ''

  // 尝试解析为 JSON 并格式化
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return content
  }
})

// 内容是否过长（超过 200 字符默认折叠）
const isContentLong = computed(() => {
  return formattedContent.value.length > 200
})
</script>

<template>
  <div
    class="tool-result-block rounded-lg border overflow-hidden"
    :class="[statusConfig.bgColor, statusConfig.borderColor]"
  >
    <!-- 头部：工具名、状态 -->
    <div class="px-4 py-2.5 flex items-center gap-3">
      <!-- 工具图标 -->
      <div class="w-8 h-8 rounded-lg bg-(--ui-bg-elevated) flex items-center justify-center flex-shrink-0">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-(--ui-text-muted)" />
      </div>

      <!-- 工具信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-(--ui-text) truncate">{{ toolName }}</span>
          <span class="text-xs text-(--ui-text-muted)">工具结果</span>
        </div>
      </div>

      <!-- 状态标签 -->
      <div class="flex items-center gap-1.5" :class="statusConfig.color">
        <UIcon :name="statusConfig.icon" class="w-4 h-4" />
        <span class="text-xs font-medium">{{ statusConfig.label }}</span>
      </div>
    </div>

    <!-- 结果内容区域 -->
    <div v-if="formattedContent" class="border-t" :class="statusConfig.borderColor">
      <!-- 折叠按钮（内容过长时显示） -->
      <button
        v-if="isContentLong"
        class="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        @click="isExpanded = !isExpanded"
      >
        <UIcon
          :name="isExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-3.5 h-3.5 text-(--ui-text-muted)"
        />
        <span class="text-xs text-(--ui-text-muted)">
          {{ isExpanded ? '收起结果' : '展开结果' }}
        </span>
      </button>

      <!-- 内容显示 -->
      <div
        v-if="!isContentLong || isExpanded"
        class="px-4 pb-3"
        :class="isContentLong ? '' : 'pt-3'"
      >
        <pre
          class="text-xs rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap break-words"
          :class="isError ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' : 'text-(--ui-text-muted) bg-(--ui-bg)'"
        >{{ formattedContent }}</pre>
      </div>
    </div>
  </div>
</template>

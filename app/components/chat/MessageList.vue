<script setup lang="ts">
import type { Message } from '~/composables/useConversations'

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
}>()

const messagesContainer = ref<HTMLElement>()

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听消息变化，自动滚动
watch(() => props.messages.length, scrollToBottom)
watch(() => props.messages[props.messages.length - 1]?.content, scrollToBottom)

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  })
}

// 复制消息内容
async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content)
  } catch (e) {
    console.error('复制失败:', e)
  }
}
</script>

<template>
  <div
    ref="messagesContainer"
    class="flex-1 overflow-y-auto p-4 space-y-4"
  >
    <!-- 空状态 -->
    <div v-if="messages.length === 0" class="h-full flex items-center justify-center">
      <div class="text-center text-(--ui-text-muted)">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>开始新对话</p>
      </div>
    </div>

    <!-- 消息列表 -->
    <div
      v-for="message in messages"
      :key="message.id"
      class="flex gap-3"
      :class="message.role === 'user' ? 'flex-row-reverse' : ''"
    >
      <!-- 头像 -->
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        :class="message.role === 'user' ? 'bg-(--ui-primary)' : 'bg-(--ui-bg-elevated)'"
      >
        <UIcon
          :name="message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
          class="w-4 h-4"
          :class="message.role === 'user' ? 'text-white' : 'text-(--ui-primary)'"
        />
      </div>

      <!-- 消息内容 -->
      <div
        class="max-w-[70%] group"
        :class="message.role === 'user' ? 'text-right' : ''"
      >
        <div
          class="inline-block px-4 py-2 rounded-2xl"
          :class="message.role === 'user'
            ? 'bg-(--ui-primary) text-white rounded-tr-sm'
            : 'bg-(--ui-bg-elevated) rounded-tl-sm'"
        >
          <!-- 消息文本 -->
          <div class="whitespace-pre-wrap break-words text-sm">
            {{ message.content }}
            <span
              v-if="isStreaming && message.role === 'assistant' && message === messages[messages.length - 1]"
              class="inline-block w-2 h-4 bg-current animate-pulse ml-0.5"
            />
          </div>
        </div>

        <!-- 消息元信息 -->
        <div
          class="mt-1 text-xs text-(--ui-text-dimmed) flex items-center gap-2"
          :class="message.role === 'user' ? 'justify-end' : ''"
        >
          <span>{{ formatTime(message.createdAt) }}</span>
          <span v-if="message.modelName" class="opacity-70">{{ message.modelName }}</span>

          <!-- 操作按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
            title="复制"
            @click="copyMessage(message.content)"
          >
            <UIcon name="i-heroicons-clipboard" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

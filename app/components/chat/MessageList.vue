<script setup lang="ts">
import type { Message } from '~/composables/useConversations'
import { renderMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
}>()

const emit = defineEmits<{
  delete: [id: number]
  replay: [message: Message]
}>()

const messagesContainer = ref<HTMLElement>()

// 用户是否在底部（或接近底部）
const isAtBottom = ref(true)
const BOTTOM_THRESHOLD = 50 // 距离底部 50px 内视为在底部

// 检查是否在底部
function checkIfAtBottom() {
  if (!messagesContainer.value) return true
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD
}

// 滚动事件处理
function handleScroll() {
  isAtBottom.value = checkIfAtBottom()
}

// 渲染后的消息内容缓存
const renderedMessages = ref<Map<number, string>>(new Map())
const renderingIds = ref<Set<number>>(new Set())

// 自动滚动到底部（仅当用户在底部时）
function scrollToBottom() {
  if (!isAtBottom.value) return
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 强制滚动到底部（新消息发送时使用）
function forceScrollToBottom() {
  isAtBottom.value = true
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 滚动到压缩请求位置
function scrollToCompressRequest() {
  const compressRequestIndex = props.messages.findIndex(m => m.mark === 'compress-request')
  if (compressRequestIndex < 0 || !messagesContainer.value) return

  // 找到对应的 DOM 元素并滚动
  nextTick(() => {
    const messageElements = messagesContainer.value?.querySelectorAll('[data-message-id]')
    if (messageElements && messageElements[compressRequestIndex]) {
      messageElements[compressRequestIndex].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

// 暴露给父组件
defineExpose({ scrollToBottom: forceScrollToBottom, scrollToCompressRequest })

// 渲染单条消息的 Markdown
async function renderMessage(message: Message) {
  // 用户消息不渲染 Markdown
  if (message.role === 'user') return

  // 正在渲染中的跳过
  if (renderingIds.value.has(message.id)) return

  // 已有缓存且内容未变化则跳过
  const cached = renderedMessages.value.get(message.id)
  if (cached !== undefined) {
    // 检查内容是否变化（流式更新时）
    const currentContent = message.content
    // 使用简单的长度检查来判断是否需要重新渲染
    if (!props.isStreaming) return
  }

  renderingIds.value.add(message.id)
  try {
    const html = await renderMarkdown(message.content)
    renderedMessages.value.set(message.id, html)
  } finally {
    renderingIds.value.delete(message.id)
  }
}

// 获取渲染后的内容
function getRenderedContent(message: Message): string {
  if (message.role === 'user') {
    return message.content
  }
  return renderedMessages.value.get(message.id) || message.content
}

// 检查是否需要显示原始内容（正在流式输出或渲染中）
function shouldShowRaw(message: Message): boolean {
  if (message.role === 'user') return true
  // 流式输出的最后一条消息显示原始内容
  if (props.isStreaming && message === props.messages[props.messages.length - 1]) {
    return true
  }
  // 还没有渲染完成时显示原始内容
  if (!renderedMessages.value.has(message.id)) {
    return true
  }
  return false
}

// 监听消息变化，自动滚动
// 新消息添加时强制滚动到底部（让用户看到新消息）
watch(() => props.messages.length, forceScrollToBottom)
// 流式输出时，只有用户在底部才跟随滚动
watch(() => props.messages[props.messages.length - 1]?.content, scrollToBottom)

// 监听消息变化，渲染 Markdown
watch(
  () => props.messages,
  async (messages) => {
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        // 流式输出时不渲染最后一条消息
        if (props.isStreaming && msg === messages[messages.length - 1]) {
          continue
        }
        await renderMessage(msg)
      }
    }
  },
  { immediate: true, deep: true }
)

// 流式输出结束后渲染最后一条消息
watch(
  () => props.isStreaming,
  async (streaming, prevStreaming) => {
    if (prevStreaming && !streaming) {
      // 流式输出刚结束
      const lastMsg = props.messages[props.messages.length - 1]
      if (lastMsg?.role === 'assistant') {
        renderedMessages.value.delete(lastMsg.id) // 清除旧缓存
        await renderMessage(lastMsg)
      }
    }
  }
)

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

// 删除确认状态
const deleteConfirmId = ref<number | null>(null)
const showDeleteConfirm = ref(false)

// 处理删除（打开确认框）
function handleDelete(id: number) {
  deleteConfirmId.value = id
  showDeleteConfirm.value = true
}

// 确认删除
function confirmDelete() {
  if (deleteConfirmId.value) {
    emit('delete', deleteConfirmId.value)
  }
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
}

// 取消删除
function cancelDelete() {
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
}
</script>

<template>
  <div
    ref="messagesContainer"
    class="flex-1 overflow-y-auto p-4 space-y-4"
    @scroll="handleScroll"
  >
    <!-- 空状态 -->
    <div v-if="messages.length === 0" class="h-full flex items-center justify-center">
      <div class="text-center text-(--ui-text-muted)">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>开始新对话</p>
      </div>
    </div>

    <!-- 消息列表 -->
    <template v-for="(message, index) in messages" :key="message.id">
      <!-- 压缩请求前的分界线 -->
      <div
        v-if="message.mark === 'compress-request'"
        class="flex items-center gap-4 py-4"
      >
        <div class="flex-1 h-px bg-(--ui-border)" />
        <span class="text-xs text-(--ui-text-muted) flex items-center gap-1">
          <UIcon name="i-heroicons-archive-box" class="w-3 h-3" />
          以上内容已压缩
        </span>
        <div class="flex-1 h-px bg-(--ui-border)" />
      </div>

      <div
        class="flex gap-3"
        :class="message.role === 'user' ? 'flex-row-reverse' : ''"
        :data-message-id="message.id"
      >
      <!-- 头像 -->
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        :class="[
          message.mark === 'compress-request' ? 'bg-blue-500' :
          message.role === 'user' ? 'bg-(--ui-primary)' : 'bg-(--ui-bg-elevated)'
        ]"
      >
        <UIcon
          :name="message.mark === 'compress-request' ? 'i-heroicons-archive-box-arrow-down' :
                 message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
          class="w-4 h-4"
          :class="[
            message.mark === 'compress-request' ? 'text-white' :
            message.role === 'user' ? 'text-white' : 'text-(--ui-primary)'
          ]"
        />
      </div>

      <!-- 消息内容 -->
      <div
        class="max-w-[70%] group"
        :class="message.role === 'user' ? 'text-right' : ''"
      >
        <div
          class="inline-block px-4 py-2 rounded-2xl"
          :class="[
            message.role === 'user' && message.mark !== 'compress-request'
              ? 'bg-(--ui-primary) text-white rounded-tr-sm'
              : message.mark === 'error'
                ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-tl-sm'
                : message.mark === 'compress-request'
                  ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-tl-sm'
                  : message.mark === 'compress-response'
                    ? 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-tl-sm'
                    : 'bg-(--ui-bg-elevated) rounded-tl-sm'
          ]"
        >
          <!-- 压缩请求消息 -->
          <div v-if="message.mark === 'compress-request'" class="text-sm">
            <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <UIcon name="i-heroicons-archive-box-arrow-down" class="w-4 h-4" />
              <span class="font-medium">压缩请求</span>
            </div>
          </div>
          <!-- 压缩响应消息（可折叠） -->
          <div v-else-if="message.mark === 'compress-response'" class="text-sm">
            <div class="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
              <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
              <span class="font-medium">对话摘要</span>
            </div>
            <div class="whitespace-pre-wrap break-words">{{ message.content }}</div>
          </div>
          <!-- 用户消息：纯文本 -->
          <div v-else-if="message.role === 'user'" class="whitespace-pre-wrap break-words text-sm">
            {{ message.content }}
          </div>
          <!-- 错误消息 -->
          <div v-else-if="message.mark === 'error'" class="text-sm flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
          </div>
          <!-- 助手消息：Markdown 渲染 -->
          <div v-else class="text-sm">
            <!-- 流式输出中显示原始文本 + 光标 -->
            <template v-if="shouldShowRaw(message)">
              <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
              <span
                v-if="isStreaming && message === messages[messages.length - 1]"
                class="inline-block w-2 h-4 bg-current animate-pulse ml-0.5"
              />
            </template>
            <!-- 渲染后的 Markdown -->
            <div v-else v-html="getRenderedContent(message)" class="markdown-content" />
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
          <!-- 重放按钮 -->
          <button
            v-if="!isStreaming"
            class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
            :title="message.role === 'user' ? '重新发送' : '重新生成'"
            @click="emit('replay', message)"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3 h-3" />
          </button>
          <!-- 删除按钮（流式输出时隐藏） -->
          <button
            v-if="!isStreaming"
            class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
            title="删除"
            @click="handleDelete(message.id)"
          >
            <UIcon name="i-heroicons-trash" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
    </template>

    <!-- 删除确认框 -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定要删除这条消息吗？" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="cancelDelete">取消</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

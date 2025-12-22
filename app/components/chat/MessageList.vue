<script setup lang="ts">
import type { Message } from '~/composables/useConversations'
import type { MessageFile } from '~/shared/types'
import { renderMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
}>()

const emit = defineEmits<{
  delete: [id: number]
  replay: [message: Message]
  edit: [id: number, content: string]
  fork: [id: number]
  deleteUntil: [id: number]
  stop: []
}>()

const messagesContainer = ref<HTMLElement>()

// 图片预览状态
const previewImage = ref<string | null>(null)

// 判断是否为图片类型
function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// 获取文件图标
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'i-heroicons-photo'
  if (mimeType.startsWith('video/')) return 'i-heroicons-video-camera'
  if (mimeType.startsWith('audio/')) return 'i-heroicons-musical-note'
  if (mimeType.includes('pdf')) return 'i-heroicons-document-text'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'i-heroicons-document'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'i-heroicons-table-cells'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'i-heroicons-presentation-chart-bar'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'i-heroicons-archive-box'
  return 'i-heroicons-document'
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// 获取文件 URL
function getFileUrl(fileName: string): string {
  return `/api/files/${fileName}`
}

// 打开图片预览
function openImagePreview(fileName: string) {
  previewImage.value = getFileUrl(fileName)
}

// 关闭图片预览
function closeImagePreview() {
  previewImage.value = null
}

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

// 流式渲染的内容长度记录（用于判断是否需要重新渲染，非响应式）
const lastRenderedLength = new Map<number, number>()

// 流式渲染定时器
const streamingRenderTimer = ref<ReturnType<typeof setInterval> | null>(null)

// 渲染单条消息的 Markdown
async function renderMessage(message: Message, force = false) {
  // 用户消息不渲染 Markdown
  if (message.role === 'user') return

  // 正在渲染中的跳过（除非强制渲染）
  if (!force && renderingIds.value.has(message.id)) return

  // 检查内容长度是否变化
  const lastLength = lastRenderedLength.get(message.id) || 0
  const currentLength = message.content?.length || 0

  // 如果内容没变化且已有缓存，跳过
  if (!force && lastLength === currentLength && renderedMessages.value.has(message.id)) {
    return
  }

  renderingIds.value.add(message.id)
  try {
    const html = await renderMarkdown(message.content)
    renderedMessages.value.set(message.id, html)
    lastRenderedLength.set(message.id, currentLength)
  } finally {
    renderingIds.value.delete(message.id)
  }
}

// 启动流式渲染定时器
function startStreamingRender() {
  if (streamingRenderTimer.value) return

  streamingRenderTimer.value = setInterval(() => {
    // 找到正在流式输出的消息并渲染
    for (const msg of props.messages) {
      if (msg.role === 'assistant' && msg.status === 'streaming' && msg.content) {
        renderMessage(msg)
      }
    }
  }, 150)
}

// 停止流式渲染定时器
function stopStreamingRender() {
  if (streamingRenderTimer.value) {
    clearInterval(streamingRenderTimer.value)
    streamingRenderTimer.value = null
  }
}

// 获取渲染后的内容
function getRenderedContent(message: Message): string {
  if (message.role === 'user') {
    return message.content
  }
  return renderedMessages.value.get(message.id) || message.content
}

// 检查消息是否正在生成中（显示加载动画）
function isMessageLoading(message: Message): boolean {
  return message.role === 'assistant' &&
    (message.status === 'created' || message.status === 'pending') &&
    !message.content
}

// 检查消息是否正在流式输出
function isMessageStreaming(message: Message): boolean {
  return message.role === 'assistant' && message.status === 'streaming'
}

// 检查消息是否被中断
function isMessageStopped(message: Message): boolean {
  return message.role === 'assistant' && message.status === 'stopped'
}

// 检查是否需要显示原始内容
function shouldShowRaw(message: Message): boolean {
  if (message.role === 'user') return true
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

// 监听消息列表变化，渲染已完成的消息（不使用 deep，只在消息数量变化时触发）
watch(
  () => props.messages.length,
  async () => {
    for (const msg of props.messages) {
      if (msg.role === 'assistant' && msg.content) {
        await renderMessage(msg)
      }
    }
  },
  { immediate: true }
)

// 监听流式状态，控制定时渲染
watch(
  () => props.isStreaming,
  async (streaming, prevStreaming) => {
    if (streaming) {
      // 开始流式输出，启动定时渲染
      startStreamingRender()
    } else {
      // 流式输出结束，停止定时渲染
      stopStreamingRender()

      // 强制渲染最终内容
      if (prevStreaming) {
        for (const msg of props.messages) {
          if (msg.role === 'assistant' && msg.content) {
            await renderMessage(msg, true)
          }
        }
      }
    }
  },
  { immediate: true }
)

// 组件卸载时清理定时器
onUnmounted(() => {
  stopStreamingRender()
})

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

// 压缩响应展开状态（默认折叠）
const expandedCompressResponses = ref<Set<number>>(new Set())

function toggleCompressResponse(id: number) {
  if (expandedCompressResponses.value.has(id)) {
    expandedCompressResponses.value.delete(id)
  } else {
    expandedCompressResponses.value.add(id)
  }
}

function isCompressResponseExpanded(message: Message) {
  // 流式输出中的压缩响应始终展开
  if (props.isStreaming && message.mark === 'compress-response') {
    const compressResponseIndex = props.messages.findIndex(m => m.mark === 'compress-response')
    if (compressResponseIndex >= 0 && props.messages[compressResponseIndex].id === message.id) {
      return true
    }
  }
  return expandedCompressResponses.value.has(message.id)
}

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

// 删除以上确认状态
const deleteUntilConfirmId = ref<number | null>(null)
const showDeleteUntilConfirm = ref(false)
const deleteUntilCount = ref(0)

// 处理删除以上（打开确认框）
function handleDeleteUntil(id: number) {
  const targetIndex = props.messages.findIndex(m => m.id === id)
  if (targetIndex < 0) return
  deleteUntilConfirmId.value = id
  deleteUntilCount.value = targetIndex + 1
  showDeleteUntilConfirm.value = true
}

// 确认删除以上
function confirmDeleteUntil() {
  if (deleteUntilConfirmId.value) {
    emit('deleteUntil', deleteUntilConfirmId.value)
  }
  showDeleteUntilConfirm.value = false
  deleteUntilConfirmId.value = null
  deleteUntilCount.value = 0
}

// 取消删除以上
function cancelDeleteUntil() {
  showDeleteUntilConfirm.value = false
  deleteUntilConfirmId.value = null
  deleteUntilCount.value = 0
}

// 编辑状态
const editingId = ref<number | null>(null)
const editingContent = ref('')

// 开始编辑
function startEdit(message: Message) {
  editingId.value = message.id
  editingContent.value = message.content
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingContent.value = ''
}

// 保存编辑
function saveEdit() {
  if (editingId.value !== null && editingContent.value.trim()) {
    // 立即更新本地消息内容
    const message = props.messages.find(m => m.id === editingId.value)
    if (message) {
      message.content = editingContent.value
      // 如果是 AI 消息，清除渲染缓存以便重新渲染
      if (message.role === 'assistant') {
        renderedMessages.value.delete(message.id)
        lastRenderedLength.delete(message.id)
        renderMessage(message, true)
      }
    }
    emit('edit', editingId.value, editingContent.value)
    editingId.value = null
    editingContent.value = ''
  }
}

// 是否正在编辑某条消息
function isEditing(messageId: number): boolean {
  return editingId.value === messageId
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
        class="group min-w-0"
        :class="[
          isEditing(message.id) ? 'w-[85%]' : 'max-w-[85%]',
          message.role === 'user' ? 'text-right' : ''
        ]"
      >
        <div
          :class="[
            'px-4 py-2 rounded-2xl max-w-full overflow-hidden',
            isEditing(message.id) ? 'block' : 'inline-block',
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
            <button
              class="flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity w-full"
              @click="toggleCompressResponse(message.id)"
            >
              <UIcon
                :name="isCompressResponseExpanded(message) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4"
              />
              <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
              <span class="font-medium">对话摘要</span>
              <span v-if="!isCompressResponseExpanded(message)" class="text-xs opacity-60">点击展开</span>
            </button>
            <div
              v-if="isCompressResponseExpanded(message)"
              class="mt-2 text-(--ui-text)"
            >
              <!-- 渲染 Markdown -->
              <div v-if="!shouldShowRaw(message)" v-html="getRenderedContent(message)" class="markdown-content" />
              <span v-else class="whitespace-pre-wrap break-words">{{ message.content }}</span>
            </div>
          </div>
          <!-- 用户消息：纯文本 + 文件附件 -->
          <div v-else-if="message.role === 'user'" class="text-sm">
            <!-- 文件附件 -->
            <div v-if="message.files?.length" class="flex flex-wrap gap-2 mb-2">
              <template v-for="file in message.files" :key="file.fileName">
                <!-- 图片缩略图 -->
                <div
                  v-if="isImageMimeType(file.mimeType)"
                  class="w-20 h-20 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  @click="openImagePreview(file.fileName)"
                >
                  <img
                    :src="getFileUrl(file.fileName)"
                    :alt="file.name"
                    class="w-full h-full object-cover"
                  />
                </div>
                <!-- 非图片文件 -->
                <a
                  v-else
                  :href="getFileUrl(file.fileName)"
                  target="_blank"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <UIcon :name="getFileIcon(file.mimeType)" class="w-5 h-5" />
                  <div class="text-left">
                    <div class="text-xs font-medium truncate max-w-[120px]">{{ file.name }}</div>
                    <div class="text-[10px] opacity-70">{{ formatFileSize(file.size) }}</div>
                  </div>
                </a>
              </template>
            </div>
            <!-- 文本内容（编辑模式） -->
            <template v-if="isEditing(message.id)">
              <textarea
                ref="editTextareaRef"
                v-model="editingContent"
                class="w-full bg-transparent text-white resize-none outline-none whitespace-pre-wrap field-sizing-content"
                @keydown.escape="cancelEdit"
                @keydown.ctrl.enter="saveEdit"
              />
              <div class="flex justify-end gap-2 mt-2 text-white/80">
                <button
                  class="px-2 py-0.5 text-xs hover:text-white"
                  @click="cancelEdit"
                >
                  取消
                </button>
                <button
                  class="px-2 py-0.5 text-xs hover:text-white"
                  @click="saveEdit"
                >
                  保存
                </button>
              </div>
            </template>
            <!-- 文本内容（显示模式） -->
            <div v-else-if="message.content" class="whitespace-pre-wrap break-words">
              {{ message.content }}
            </div>
          </div>
          <!-- 错误消息 -->
          <div v-else-if="message.mark === 'error'" class="text-sm flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
          </div>
          <!-- 助手消息：Markdown 渲染 -->
          <div v-else class="text-sm">
            <!-- 编辑模式 -->
            <template v-if="isEditing(message.id)">
              <textarea
                v-model="editingContent"
                class="w-full bg-transparent text-(--ui-text) resize-none outline-none whitespace-pre-wrap field-sizing-content"
                @keydown.escape="cancelEdit"
                @keydown.ctrl.enter="saveEdit"
              />
              <div class="flex justify-end gap-2 mt-2 text-(--ui-text-muted)">
                <button
                  class="px-2 py-0.5 text-xs hover:text-(--ui-text)"
                  @click="cancelEdit"
                >
                  取消
                </button>
                <button
                  class="px-2 py-0.5 text-xs hover:text-(--ui-text)"
                  @click="saveEdit"
                >
                  保存
                </button>
              </div>
            </template>
            <!-- 正在加载（created/pending 状态） -->
            <template v-else-if="isMessageLoading(message)">
              <div class="flex items-center gap-1">
                <span class="loading-dot w-2 h-2 rounded-full bg-current opacity-60" style="animation-delay: 0s" />
                <span class="loading-dot w-2 h-2 rounded-full bg-current opacity-60" style="animation-delay: 0.2s" />
                <span class="loading-dot w-2 h-2 rounded-full bg-current opacity-60" style="animation-delay: 0.4s" />
              </div>
            </template>
            <!-- 有渲染内容时显示 Markdown -->
            <template v-else-if="!shouldShowRaw(message)">
              <div v-html="getRenderedContent(message)" class="markdown-content" />
              <!-- 流式输出时在末尾显示光标 -->
              <span
                v-if="isMessageStreaming(message)"
                class="inline-block w-2 h-4 bg-current animate-pulse align-middle"
              />
            </template>
            <!-- 还没有渲染内容时显示原始文本 -->
            <template v-else>
              <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
              <span
                v-if="isMessageStreaming(message)"
                class="inline-block w-2 h-4 bg-current animate-pulse ml-0.5"
              />
            </template>
            <!-- 被中断的标记 -->
            <div
              v-if="isMessageStopped(message) && message.content && !isEditing(message.id)"
              class="mt-2 text-xs text-(--ui-text-muted) flex items-center gap-1"
            >
              <UIcon name="i-heroicons-stop-circle" class="w-3 h-3" />
              <span>已中断</span>
            </div>
          </div>
        </div>

        <!-- 消息元信息 -->
        <div
          class="mt-1 text-xs text-(--ui-text-dimmed) flex items-center gap-2"
          :class="message.role === 'user' ? 'justify-end' : ''"
        >
          <span>{{ formatTime(message.createdAt) }}</span>
          <span v-if="message.modelName" class="opacity-70">{{ message.modelName }}</span>

          <!-- 操作按钮（非生成状态时显示） -->
          <template v-if="!isMessageStreaming(message) && !isMessageLoading(message)">
            <!-- 编辑按钮 -->
            <button
              v-if="!isStreaming && message.mark !== 'compress-request' && message.mark !== 'compress-response'"
              class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
              title="编辑"
              @click="startEdit(message)"
            >
              <UIcon name="i-heroicons-pencil" class="w-3 h-3" />
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
            <!-- 删除按钮 -->
            <button
              v-if="!isStreaming"
              class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
              title="删除"
              @click="handleDelete(message.id)"
            >
              <UIcon name="i-heroicons-trash" class="w-3 h-3" />
            </button>
            <!-- 更多操作下拉菜单 -->
            <UDropdownMenu
              v-if="!isStreaming && message.mark !== 'compress-request' && message.mark !== 'compress-response'"
              :items="[
                [
                  {
                    label: '复制',
                    icon: 'i-heroicons-clipboard',
                    onSelect: () => copyMessage(message.content)
                  },
                  {
                    label: '分叉对话',
                    icon: 'i-lucide-split',
                    onSelect: () => emit('fork', message.id)
                  },
                  {
                    label: '删除此消息及以上',
                    icon: 'i-heroicons-fire',
                    onSelect: () => handleDeleteUntil(message.id)
                  }
                ]
              ]"
            >
              <button
                class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-(--ui-bg-elevated) rounded"
                title="更多操作"
              >
                <UIcon name="i-heroicons-ellipsis-horizontal" class="w-3 h-3" />
              </button>
            </UDropdownMenu>
          </template>
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

    <!-- 删除以上确认框 -->
    <UModal v-model:open="showDeleteUntilConfirm" title="确认删除" :close="false">
      <template #body>
        <p class="text-(--ui-text-muted)">
          确定要删除此消息及之前的共 <span class="font-medium text-(--ui-text)">{{ deleteUntilCount }}</span> 条消息吗？此操作不可撤销。
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDeleteUntil">删除</UButton>
          <UButton variant="outline" color="neutral" @click="cancelDeleteUntil">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 图片预览 -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      @click="closeImagePreview"
    >
      <button
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
        @click="closeImagePreview"
      >
        <UIcon name="i-heroicons-x-mark" class="w-6 h-6" />
      </button>
      <img
        :src="previewImage"
        class="max-w-full max-h-full object-contain rounded-lg"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
.loading-dot {
  animation: loading-bounce 1.2s ease-in-out infinite;
}

@keyframes loading-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

/* 限制 markdown 内容宽度，防止代码块撑开页面 */
.markdown-content {
  max-width: 100%;
  overflow-x: auto;
}

.markdown-content :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}
</style>

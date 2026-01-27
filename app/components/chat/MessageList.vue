<script setup lang="ts">
import type { Message } from '~/composables/useConversations'
import type { MessageFile } from '~/shared/types'
import { useConversationSuggestions } from '~/composables/useConversationSuggestions'
import { DEFAULT_CHAT_FALLBACK_ESTIMATED_TIME, MESSAGE_MARK } from '~/shared/constants'

const { isMessageStreaming: checkMessageStreaming } = useConversations()

// 格式化时间为友好格式
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hours}:${minutes}`
}

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
  assistantId?: number | null
  conversationId?: number | null
  estimatedTime?: number | null  // 预计首字时长（秒）
  autoApproveMcp?: boolean  // 自动通过 MCP 调用
}>()

const emit = defineEmits<{
  delete: [id: number]
  replay: [message: Message]
  edit: [id: number, content: string]
  fork: [id: number]
  deleteUntil: [id: number]
  stop: []
  sendSuggestion: [content: string]
  'update:autoApproveMcp': [value: boolean]
}>()

// 开场白建议
const { getSuggestions, isLoading: isSuggestionsLoading, loadSuggestions, refreshSuggestions } = useConversationSuggestions()

const suggestions = computed(() => {
  if (!props.assistantId) return []
  return getSuggestions(props.assistantId)
})

const suggestionsLoading = computed(() => {
  if (!props.assistantId) return false
  return isSuggestionsLoading(props.assistantId)
})

// 是否显示开场白（空对话时显示）
const showSuggestions = computed(() => {
  return props.messages.length === 0 && props.assistantId
})

// 加载开场白
watch(() => props.assistantId, (id) => {
  if (id && props.messages.length === 0) {
    loadSuggestions(id)
  }
}, { immediate: true })

// 点击开场白
function handleSuggestionClick(suggestion: string) {
  emit('sendSuggestion', suggestion)
}

// 换一批
function handleRefresh() {
  if (props.assistantId) {
    refreshSuggestions(props.assistantId)
  }
}

const messagesContainer = ref<HTMLElement>()

// 图片预览状态
const showImagePreview = ref(false)
const previewImageUrl = ref('')

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
  previewImageUrl.value = getFileUrl(fileName)
  showImagePreview.value = true
}

// 关闭图片预览
function closeImagePreview() {
  showImagePreview.value = false
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
// 持续滚动 50ms，确保异步渲染完成后仍能滚到底部
function forceScrollToBottom() {
  isAtBottom.value = true
  const startTime = Date.now()
  const scrollOnce = () => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }
  // 立即滚动一次
  scrollOnce()
  // 持续滚动 50ms
  const timer = setInterval(() => {
    scrollOnce()
    if (Date.now() - startTime >= 50) {
      clearInterval(timer)
    }
  }, 10)
}

// 暴露给父组件
defineExpose({ scrollToBottom: forceScrollToBottom })

// 流式滚动定时器（仅用于滚动，不再用于渲染）
const streamingScrollTimer = ref<ReturnType<typeof setInterval> | null>(null)

// 启动流式滚动定时器
function startStreamingScroll() {
  if (streamingScrollTimer.value) return
  streamingScrollTimer.value = setInterval(() => {
    scrollToBottom()
  }, 150)
}

// 停止流式滚动定时器
function stopStreamingScroll() {
  if (streamingScrollTimer.value) {
    clearInterval(streamingScrollTimer.value)
    streamingScrollTimer.value = null
  }
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

// ==================== 首字倒计时逻辑 ====================
// 倒计时：当前时间（定时更新）
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null
// 记录 loading 消息的创建时间
const loadingMessageCreatedAt = ref<number | null>(null)

// 获取正在 loading 的消息
const loadingMessage = computed(() => {
  return props.messages.find(m => isMessageLoading(m))
})

// 预计首字时长（秒）
const estimatedSeconds = computed(() => {
  return props.estimatedTime ?? DEFAULT_CHAT_FALLBACK_ESTIMATED_TIME
})

// 计算已用时间（秒）
const elapsedTime = computed(() => {
  if (!loadingMessageCreatedAt.value) return 0
  return (now.value - loadingMessageCreatedAt.value) / 1000
})

// 计算剩余倒计时（秒，保留两位小数）
const remainingTime = computed(() => {
  if (!loadingMessageCreatedAt.value) return null
  const remaining = estimatedSeconds.value - elapsedTime.value
  return remaining > 0 ? remaining.toFixed(2) : null
})

// 是否超时（倒计时归零）
const isOvertime = computed(() => {
  if (!loadingMessageCreatedAt.value) return false
  return elapsedTime.value > estimatedSeconds.value
})

// 超时后显示的超出时间（秒，保留两位小数）
const overtimeDisplay = computed(() => {
  if (!isOvertime.value) return null
  return (elapsedTime.value - estimatedSeconds.value).toFixed(2)
})

// 监听 loading 消息变化，启动/停止倒计时
watch(loadingMessage, (newMsg, oldMsg) => {
  if (newMsg && !oldMsg) {
    // 开始倒计时：使用当前时间作为起点，而不是消息的 createdAt
    // 因为消息的 createdAt 是后端时间戳，会比前端当前时间早（网络延迟+处理时间）
    loadingMessageCreatedAt.value = Date.now()
    now.value = Date.now()
    countdownTimer = setInterval(() => {
      now.value = Date.now()
    }, 50) // 50ms 更新一次，确保两位小数流畅
  } else if (!newMsg && oldMsg) {
    // 停止倒计时
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    loadingMessageCreatedAt.value = null
  }
}, { immediate: true })

// 组件卸载时清理倒计时定时器
onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})
// ==================== 首字倒计时逻辑结束 ====================

// 监听消息变化，自动滚动
// 新消息添加时强制滚动到底部（让用户看到新消息）
// 注意：只在消息数量增加时滚动，删除消息时不滚动
watch(() => props.messages.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    forceScrollToBottom()
  }
})

// 监听流式状态，控制滚动定时器
watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming) {
      startStreamingScroll()
    } else {
      stopStreamingScroll()
    }
  },
  { immediate: true }
)

// 组件卸载时清理滚动定时器
onUnmounted(() => {
  stopStreamingScroll()
})

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

// 移动端点击显示操作按钮的消息 ID
const activeMessageId = ref<number | null>(null)

function toggleMessageActions(id: number) {
  activeMessageId.value = activeMessageId.value === id ? null : id
}

function isMessageActive(id: number): boolean {
  return activeMessageId.value === id
}

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
  if (props.isStreaming && message.mark === MESSAGE_MARK.COMPRESS_RESPONSE) {
    const compressResponseIndex = props.messages.findIndex(m => m.mark === MESSAGE_MARK.COMPRESS_RESPONSE)
    const compressResponse = props.messages[compressResponseIndex]
    if (compressResponseIndex >= 0 && compressResponse?.id === message.id) {
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

// 工具调用确认状态管理
// key: messageId, value: { toolCallId: approved }
const toolCallApprovals = ref<Record<number, Record<string, boolean>>>({})
const confirmingMessageId = ref<number | null>(null)

// 初始化消息的工具调用批准状态（默认全部批准）
function initToolCallApprovals(messageId: number, toolCallIds: string[]) {
  if (!toolCallApprovals.value[messageId]) {
    toolCallApprovals.value[messageId] = {}
  }
  toolCallIds.forEach(id => {
    if (toolCallApprovals.value[messageId]![id] === undefined) {
      toolCallApprovals.value[messageId]![id] = true // 默认批准
    }
  })
}

// 更新单个工具调用的批准状态
function updateToolCallApproval(messageId: number, toolCallId: string, approved: boolean) {
  if (!toolCallApprovals.value[messageId]) {
    toolCallApprovals.value[messageId] = {}
  }
  toolCallApprovals.value[messageId]![toolCallId] = approved
}

// 获取单个工具调用的批准状态
function getToolCallApproval(messageId: number, toolCallId: string): boolean {
  return toolCallApprovals.value[messageId]?.[toolCallId] ?? true
}

// 检查消息是否有 pending 状态的工具调用
function hasPendingToolCalls(message: Message): boolean {
  return message.toolCalls?.some(tc => tc.status === 'pending') ?? false
}

// 确认工具调用
async function confirmToolCalls(messageId: number) {
  const approvals = toolCallApprovals.value[messageId]
  if (!approvals) return

  confirmingMessageId.value = messageId

  try {
    // 批量发送确认请求
    const promises = Object.entries(approvals).map(([toolCallId, approved]) =>
      $fetch(`/api/messages/${messageId}/tool-confirm`, {
        method: 'POST',
        body: {
          toolCallId,
          action: approved ? 'approve' : 'reject',
        },
      })
    )

    await Promise.all(promises)

    // 清理已确认的状态
    delete toolCallApprovals.value[messageId]
  } catch (err) {
    console.error('工具调用确认失败:', err)
  } finally {
    confirmingMessageId.value = null
  }
}

// 计算消息大小（参考 MessageInput.vue 的计算公式）
function getMessageSize(message: Message): number {
  let size = new TextEncoder().encode(message.content).length
  if (message.files?.length) {
    for (const file of message.files) {
      // 只有图片会作为 base64 发送给 AI
      if (file.mimeType.startsWith('image/')) {
        size += Math.ceil(file.size * 4 / 3) // base64 编码后的大小
      }
    }
  }
  return size
}

// 格式化大小显示
function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

// 格式化耗时显示
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

// 获取消息的下拉菜单项
function getMessageMenuItems(message: Message) {
  const items: any[][] = []

  // 信息组（模型、耗时和大小）
  const infoItems: any[] = []
  if (message.modelDisplayName) {
    infoItems.push({
      label: message.modelDisplayName,
      icon: 'i-heroicons-cpu-chip',
      disabled: true,
    })
  }
  if (message.duration) {
    infoItems.push({
      label: formatDuration(message.duration),
      icon: 'i-heroicons-clock',
      disabled: true,
    })
  }
  infoItems.push({
    label: formatSize(getMessageSize(message)),
    icon: 'i-heroicons-document-text',
    disabled: true,
  })
  items.push(infoItems)

  // 操作组
  items.push([
    {
      label: '复制',
      icon: 'i-heroicons-clipboard',
      onSelect: () => copyMessage(message.content),
    },
    {
      label: '分叉对话',
      icon: 'i-lucide-split',
      onSelect: () => emit('fork', message.id),
    },
    {
      label: '删除此消息及以上',
      icon: 'i-heroicons-fire',
      onSelect: () => handleDeleteUntil(message.id),
    },
  ])

  return items
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
    <!-- 空状态：开场白建议 -->
    <div v-if="showSuggestions" class="h-full flex items-center justify-center">
      <div class="text-center max-w-md px-4">
        <!-- 加载中 -->
        <template v-if="suggestionsLoading">
          <div class="flex items-center justify-center gap-1 mb-2">
            <span class="loading-dot w-2 h-2 rounded-full bg-(--ui-text-muted)" style="animation-delay: 0s" />
            <span class="loading-dot w-2 h-2 rounded-full bg-(--ui-text-muted)" style="animation-delay: 0.2s" />
            <span class="loading-dot w-2 h-2 rounded-full bg-(--ui-text-muted)" style="animation-delay: 0.4s" />
          </div>
          <p class="text-sm text-(--ui-text-muted)">正在生成开场白...</p>
        </template>
        <!-- 有建议 -->
        <template v-else-if="suggestions.length > 0">
          <UIcon name="i-heroicons-light-bulb" class="w-8 h-8 mx-auto mb-3 text-(--ui-text-muted) opacity-60" />
          <p class="text-sm text-(--ui-text-muted) mb-4">试试这些话题开始对话</p>
          <div class="space-y-2">
            <button
              v-for="(suggestion, idx) in suggestions"
              :key="idx"
              class="w-full px-4 py-2.5 text-sm text-left rounded-lg bg-(--ui-bg-elevated) hover:bg-(--ui-bg-accented) border border-(--ui-border) transition-colors"
              @click="handleSuggestionClick(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
          <button
            class="mt-4 text-xs text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1 mx-auto transition-colors"
            @click="handleRefresh"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3 h-3" />
            换一批
          </button>
        </template>
        <!-- 无建议（默认空状态） -->
        <template v-else>
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-2 text-(--ui-text-muted) opacity-50" />
          <p class="text-(--ui-text-muted)">开始新对话</p>
        </template>
      </div>
    </div>

    <!-- 消息列表 -->
    <template v-for="(message, index) in messages" :key="message.id">
      <!-- 对话已开始分界线（第一条消息前显示，点击跳转到底部） -->
      <div
        v-if="props.conversationId && index === 0"
        class="flex items-center gap-4 py-4 cursor-pointer group"
        title="点击跳转到底部"
        @click="forceScrollToBottom"
      >
        <div class="flex-1 h-px bg-(--ui-border)" />
        <span class="text-xs text-(--ui-text-muted) flex items-center gap-1 group-hover:text-(--ui-text) transition-colors">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3 h-3" />
          对话已开始
          <UIcon name="i-heroicons-chevron-double-down" class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
        <div class="flex-1 h-px bg-(--ui-border)" />
      </div>

      <!-- 压缩请求前的分界线 -->
      <div
        v-if="message.mark === MESSAGE_MARK.COMPRESS_REQUEST"
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
        style="position: relative;"
      >
      <!-- 头像（移动端隐藏） -->
      <!-- 角色标签（用于复制和辅助功能） -->
      <span v-if="message.mark === null" class="sr-only">[{{ message.role === 'user' ? '用户' : '助手' }} {{ formatDateTime(message.createdAt) }}]
</span>
      <div
        class="hidden md:flex w-8 h-8 rounded-full items-center justify-center flex-shrink-0"
        :class="[
          message.mark === MESSAGE_MARK.COMPRESS_REQUEST ? 'bg-blue-500' :
          message.role === 'user' ? 'bg-(--ui-primary)' : 'bg-(--ui-bg-elevated)'
        ]"
      >
        <UIcon
          :name="message.mark === MESSAGE_MARK.COMPRESS_REQUEST ? 'i-heroicons-archive-box-arrow-down' :
                 message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
          class="w-4 h-4"
          :class="[
            message.mark === MESSAGE_MARK.COMPRESS_REQUEST ? 'text-white' :
            message.role === 'user' ? 'text-white' : 'text-(--ui-primary)'
          ]"
        />
      </div>

      <!-- 消息内容 -->
      <div
        class="group min-w-0"
        :class="[
          isEditing(message.id) ? 'w-full md:w-[85%]' : 'max-w-full md:max-w-[85%]',
          message.role === 'user' ? 'flex flex-col items-end' : ''
        ]"
      >
        <div
          :class="[
            'max-w-full overflow-hidden',
            'px-4 py-2 rounded-2xl cursor-pointer md:cursor-auto',
            isEditing(message.id) ? 'block' : 'inline-block',
            message.role === 'user' && message.mark !== MESSAGE_MARK.COMPRESS_REQUEST
              ? 'bg-(--ui-primary) text-white rounded-tr-sm'
              : message.mark === MESSAGE_MARK.ERROR
                ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-tl-sm'
                : message.mark === MESSAGE_MARK.COMPRESS_REQUEST
                  ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-tl-sm'
                  : message.mark === MESSAGE_MARK.COMPRESS_RESPONSE
                    ? 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-tl-sm'
                    : 'bg-(--ui-bg-elevated) rounded-tl-sm'
          ]"
          @click="toggleMessageActions(message.id)"
        >

          <!-- 压缩请求消息 -->
          <div v-if="message.mark === MESSAGE_MARK.COMPRESS_REQUEST" class="text-sm">
            <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <UIcon name="i-heroicons-archive-box-arrow-down" class="w-4 h-4" />
              <span class="font-medium">压缩请求</span>
            </div>
          </div>
          <!-- 压缩响应消息（可折叠） -->
          <div v-else-if="message.mark === MESSAGE_MARK.COMPRESS_RESPONSE" class="text-sm">
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
              <ChatStreamMarkdown :content="message.content" />
            </div>
          </div>
          <!-- 用户消息：Markdown 渲染 + 文件附件 -->
          <div v-else-if="message.role === 'user'" class="text-sm user-message-content">
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
            <!-- 文本内容（显示模式）：Markdown 渲染 -->
            <template v-else-if="message.content">
              <ChatStreamMarkdown :content="message.content" />
            </template>
          </div>
          <!-- 错误消息 -->
          <div v-else-if="message.mark === MESSAGE_MARK.ERROR" class="text-sm flex items-start gap-2">
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
                <span v-if="remainingTime" class="ml-1 text-xs text-(--ui-text-muted) tabular-nums">{{ remainingTime }}s</span>
                <span v-else-if="isOvertime" class="ml-1 text-xs text-(--ui-text-muted) tabular-nums">+{{ overtimeDisplay }}s</span>
              </div>
            </template>
            <!-- 有内容时使用 StreamMarkdown 渲染 -->
            <template v-else-if="message.content">
              <ChatStreamMarkdown
                :content="message.content"
                :is-streaming="isMessageStreaming(message)"
                :message-id="message.id"
              />
            </template>
            <!-- 工具调用块（紧凑排列） -->
            <div v-if="message.toolCalls?.length" class="mt-2 rounded-lg border border-(--ui-border) overflow-hidden">
              <ChatToolCallBlock
                v-for="toolCall in message.toolCalls"
                :key="toolCall.id"
                :tool-call="toolCall"
                :message-id="message.id"
                :approved="getToolCallApproval(message.id, toolCall.id)"
                @update:approved="(val) => updateToolCallApproval(message.id, toolCall.id, val)"
                @vue:mounted="initToolCallApprovals(message.id, message.toolCalls!.map(tc => tc.id))"
              />
              <!-- 统一确认按钮（仅在有 pending 状态时显示） -->
              <div
                v-if="hasPendingToolCalls(message)"
                class="px-4 py-3 flex items-center justify-between border-t border-(--ui-border)"
              >
                <label class="flex items-center gap-2 text-sm text-(--ui-text-muted) cursor-pointer select-none">
                  <UCheckbox
                    :model-value="autoApproveMcp"
                    @update:model-value="emit('update:autoApproveMcp', $event)"
                  />
                  <span>自动通过</span>
                </label>
                <UButton
                  size="sm"
                  color="primary"
                  :loading="confirmingMessageId === message.id"
                  :disabled="confirmingMessageId === message.id"
                  @click="confirmToolCalls(message.id)"
                >
                  <UIcon name="i-heroicons-check" class="w-4 h-4 mr-1" />
                  确定
                </UButton>
              </div>
            </div>
            <!-- 被中断的标记 -->
            <div
              v-if="isMessageStopped(message) && !isEditing(message.id)"
              :class="[
                'text-xs text-(--ui-text-muted) flex items-center gap-1',
                message.content ? 'mt-2' : ''
              ]"
            >
              <UIcon name="i-heroicons-stop-circle" class="w-3 h-3" />
              <span>已中断</span>
            </div>
          </div>
        </div>

        <!-- 消息元信息（非生成状态时显示） -->
        <div
          v-if="!isMessageStreaming(message) && !isMessageLoading(message)"
          :class="[
            'mt-1 text-xs text-(--ui-text-dimmed) flex items-center gap-2 transition-opacity select-none',
            isMessageActive(message.id) ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
          ]"
        >
          <TimeAgo :time="message.createdAt" />

          <!-- 操作按钮 -->
          <!-- 编辑按钮 -->
          <button
            v-if="!checkMessageStreaming(message.id) && message.mark !== MESSAGE_MARK.COMPRESS_REQUEST && message.mark !== MESSAGE_MARK.COMPRESS_RESPONSE"
            class="p-1 hover:bg-(--ui-bg-elevated) rounded"
            title="编辑"
            @click="startEdit(message)"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3" />
          </button>
          <!-- 重放按钮 -->
          <button
            v-if="!checkMessageStreaming(message.id)"
            class="p-1 hover:bg-(--ui-bg-elevated) rounded"
            :title="message.role === 'user' ? '重新发送' : '重新生成'"
            @click="emit('replay', message)"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3 h-3" />
          </button>
          <!-- 删除按钮 -->
          <button
            v-if="!checkMessageStreaming(message.id)"
            class="p-1 hover:bg-(--ui-bg-elevated) rounded"
            title="删除"
            @click="handleDelete(message.id)"
          >
            <UIcon name="i-heroicons-trash" class="w-3 h-3" />
          </button>
          <!-- 更多操作下拉菜单 -->
          <UDropdownMenu
            v-if="!checkMessageStreaming(message.id) && message.mark !== MESSAGE_MARK.COMPRESS_REQUEST && message.mark !== MESSAGE_MARK.COMPRESS_RESPONSE"
            :items="getMessageMenuItems(message)"
            @update:open="(open: boolean) => activeMessageId = open ? message.id : null"
          >
            <UButton
              variant="ghost"
              size="xs"
              title="更多操作"
            >
              <UIcon name="i-heroicons-ellipsis-vertical" class="w-3 h-3" />
            </UButton>
          </UDropdownMenu>
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
    <UModal v-model:open="showImagePreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-(--ui-bg) flex items-center justify-center">
          <img
            :src="previewImageUrl"
            class="max-h-[85vh] object-contain"
          />
        </div>
      </template>
    </UModal>
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

/* 用户消息的 Markdown 样式覆盖 */
.user-message-content :deep(.markdown-content) {
  color: white;
}

.user-message-content :deep(.markdown-content pre) {
  background: rgba(255, 255, 255, 0.15);
}

.user-message-content :deep(.markdown-content code:not(pre code)) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.user-message-content :deep(.markdown-content a) {
  color: white;
  text-decoration: underline;
}

.user-message-content :deep(.markdown-content blockquote) {
  border-left-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.9);
}

.user-message-content :deep(.markdown-content table th),
.user-message-content :deep(.markdown-content table td) {
  border-color: rgba(255, 255, 255, 0.3);
}

.user-message-content :deep(.markdown-content hr) {
  border-color: rgba(255, 255, 255, 0.3);
}
</style>

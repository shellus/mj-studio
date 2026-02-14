<script setup lang="ts">
import type { Conversation } from '~/composables/useConversations'

const props = defineProps<{
  conversations: Conversation[]
  currentConversationId: number | null
  assistantId: number | null  // 新增：需要知道当前助手ID
  hasMore: boolean  // 是否还有更多对话
  isLoadingMore: boolean  // 是否正在加载更多
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  delete: [id: number]
  rename: [id: number, title: string]
  generateTitle: [id: number]
  share: [id: number]
  duplicate: [id: number]
  loadConversations: [type: 'permanent' | 'temporary']  // 新增：通知父组件加载对话
  loadMore: [type: 'permanent' | 'temporary']  // 新增：加载更多对话
}>()

// Tab 切换状态（永久/临时）
const activeTab = ref<'permanent' | 'temporary'>('permanent')

// 监听 Tab 切换，触发加载对话
watch(activeTab, (newTab) => {
  if (props.assistantId) {
    emit('loadConversations', newTab)
  }
})

// 监听 assistantId 变化，重置 Tab 并加载永久对话
watch(() => props.assistantId, (newId) => {
  if (newId) {
    activeTab.value = 'permanent'
    emit('loadConversations', 'permanent')
  }
})

// 滚动容器 ref
const scrollContainerRef = ref<HTMLElement | null>(null)

// 监听滚动事件，触发加载更多
function handleScroll() {
  if (!scrollContainerRef.value || props.isLoadingMore || !props.hasMore) {
    return
  }

  const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.value
  // 距离底部 100px 时触发加载
  if (scrollHeight - scrollTop - clientHeight < 100) {
    emit('loadMore', activeTab.value)
  }
}

// 组件挂载时添加滚动监听
onMounted(() => {
  scrollContainerRef.value?.addEventListener('scroll', handleScroll)
})

// 组件卸载时移除滚动监听
onUnmounted(() => {
  scrollContainerRef.value?.removeEventListener('scroll', handleScroll)
})

// 删除确认
const deleteConfirmId = ref<number | null>(null)
const showDeleteConfirm = ref(false)

function handleDelete(id: number) {
  deleteConfirmId.value = id
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (deleteConfirmId.value) {
    emit('delete', deleteConfirmId.value)
  }
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
}

// 重命名状态
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// 开始编辑
function startEdit(conv: Conversation) {
  editingId.value = conv.id
  editingTitle.value = conv.title
  // 聚焦输入框
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

// 保存编辑
function saveEdit() {
  if (editingId.value && editingTitle.value.trim()) {
    emit('rename', editingId.value, editingTitle.value.trim())
  }
  cancelEdit()
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingTitle.value = ''
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveEdit()
  } else if (e.key === 'Escape') {
    cancelEdit()
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 标题和新建按钮 -->
    <div class="flex items-center justify-between p-3 border-b border-(--ui-border)">
      <h4 class="text-sm font-medium">对话列表</h4>
      <UButton
        variant="ghost"
        size="xs"
        @click="emit('create')"
      >
        <UIcon name="i-heroicons-plus" class="w-4 h-4" />
      </UButton>
    </div>

    <!-- Tab 切换 -->
    <div class="flex border-b border-(--ui-border)">
      <button
        class="flex-1 px-3 py-2 text-sm transition-colors"
        :class="activeTab === 'permanent'
          ? 'text-(--ui-primary) border-b-2 border-(--ui-primary) font-medium'
          : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
        @click="activeTab = 'permanent'"
      >
        永久
      </button>
      <button
        class="flex-1 px-3 py-2 text-sm transition-colors"
        :class="activeTab === 'temporary'
          ? 'text-(--ui-primary) border-b-2 border-(--ui-primary) font-medium'
          : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
        @click="activeTab = 'temporary'"
      >
        临时
      </button>
    </div>

    <!-- 对话列表 -->
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto">
      <!-- 空状态 -->
      <div v-if="conversations.length === 0" class="p-4 text-center text-(--ui-text-muted) text-sm">
        暂无{{ activeTab === 'permanent' ? '永久' : '临时' }}对话
      </div>

      <!-- 对话项 -->
      <div
        v-for="conv in conversations"
        :key="conv.id"
        class="w-full p-3 text-left hover:bg-(--ui-bg) transition-colors group cursor-pointer"
        :class="conv.id === currentConversationId ? 'bg-(--ui-bg)' : ''"
        @click="editingId !== conv.id && emit('select', conv.id)"
      >
        <div class="relative flex items-start gap-2">
          <!-- 选中指示器 -->
          <span
            class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            :class="conv.id === currentConversationId ? 'bg-(--ui-primary)' : 'bg-transparent'"
          />

          <!-- 内容 -->
          <div class="flex-1 min-w-0">
            <!-- 编辑模式 -->
            <div v-if="editingId === conv.id" class="flex items-center gap-1">
              <input
                ref="inputRef"
                v-model="editingTitle"
                class="min-w-0 flex-1 text-sm px-2 py-1 rounded bg-(--ui-bg-elevated) border border-(--ui-border) focus:outline-none focus:border-(--ui-primary)"
                @keydown="handleKeydown"
                @click.stop
              />
              <!-- 确认按钮 -->
              <button
                class="flex-shrink-0 p-1 rounded hover:bg-(--ui-success)/20 text-(--ui-success)"
                title="确认"
                @click.stop="saveEdit"
              >
                <UIcon name="i-heroicons-check" class="w-4 h-4" />
              </button>
              <!-- 取消按钮 -->
              <button
                class="flex-shrink-0 p-1 rounded hover:bg-(--ui-error)/20 text-(--ui-error)"
                title="取消"
                @click.stop="cancelEdit"
              >
                <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
              </button>
            </div>
            <template v-else>
              <div class="text-sm truncate pr-6">{{ conv.title }}</div>
              <div class="text-xs text-(--ui-text-dimmed) mt-0.5">
                <TimeAgo :time="conv.updatedAt" />
              </div>
            </template>
          </div>

          <!-- 操作下拉菜单（非编辑模式时显示，绝对定位在右上角）-->
          <UDropdownMenu
            v-if="editingId !== conv.id"
            :items="[
              [
                { label: 'AI 智能重命名', icon: 'i-heroicons-sparkles', onSelect: () => emit('generateTitle', conv.id) },
                { label: '重命名', icon: 'i-heroicons-pencil', onSelect: () => startEdit(conv) },
                { label: '复制', icon: 'i-heroicons-document-duplicate', onSelect: () => emit('duplicate', conv.id) },
                { label: '分享', icon: 'i-heroicons-share', onSelect: () => emit('share', conv.id) },
              ],
              [
                { label: '删除', icon: 'i-heroicons-trash', color: 'error' as const, onSelect: () => handleDelete(conv.id) },
              ],
            ]"
          >
            <template #default="{ open }">
              <UButton
                variant="ghost"
                size="xs"
                class="absolute right-2 top-2 transition-opacity"
                :class="open ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'"
                @click.stop
              >
                <UIcon name="i-heroicons-ellipsis-vertical" class="w-4 h-4" />
              </UButton>
            </template>
          </UDropdownMenu>
        </div>
      </div>

      <!-- 加载更多指示器 -->
      <div v-if="isLoadingMore" class="p-4 text-center text-(--ui-text-muted) text-sm">
        加载中...
      </div>

      <!-- 没有更多提示 -->
      <div v-else-if="conversations.length > 0 && !hasMore" class="p-4 text-center text-(--ui-text-dimmed) text-xs">
        没有更多对话了
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定要删除这个对话吗？此操作不可撤销。" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="cancelDelete">取消</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

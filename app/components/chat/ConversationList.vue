<script setup lang="ts">
import type { Conversation } from '~/composables/useConversations'

const props = defineProps<{
  conversations: Conversation[]
  currentConversationId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  delete: [id: number]
  rename: [id: number, title: string]
  generateTitle: [id: number]
}>()

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`

  const days = Math.floor(diff / 86400000)
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

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

    <!-- 对话列表 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 空状态 -->
      <div v-if="conversations.length === 0" class="p-4 text-center text-(--ui-text-muted) text-sm">
        暂无对话
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
            <!-- 显示模式 -->
            <template v-else>
              <div class="text-sm truncate pr-6">{{ conv.title }}</div>
              <div class="text-xs text-(--ui-text-dimmed) mt-0.5">
                {{ formatTime(conv.updatedAt) }}
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
              ],
              [
                { label: '删除', icon: 'i-heroicons-trash', color: 'error' as const, onSelect: () => handleDelete(conv.id) },
              ],
            ]"
          >
            <template #default="{ open }">
              <button
                class="absolute right-2 top-2 p-1 transition-opacity"
                :class="open ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'"
                @click.stop
              >
                <UIcon name="i-heroicons-ellipsis-vertical" class="w-4 h-4" />
              </button>
            </template>
          </UDropdownMenu>
        </div>
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

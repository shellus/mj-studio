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

function handleDelete(id: number) {
  if (deleteConfirmId.value === id) {
    emit('delete', id)
    deleteConfirmId.value = null
  } else {
    deleteConfirmId.value = id
    // 3秒后重置
    setTimeout(() => {
      if (deleteConfirmId.value === id) {
        deleteConfirmId.value = null
      }
    }, 3000)
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
      <button
        v-for="conv in conversations"
        :key="conv.id"
        class="w-full p-3 text-left hover:bg-(--ui-bg) transition-colors group"
        :class="conv.id === currentConversationId ? 'bg-(--ui-bg)' : ''"
        @click="emit('select', conv.id)"
      >
        <div class="flex items-start gap-2">
          <!-- 选中指示器 -->
          <span
            class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            :class="conv.id === currentConversationId ? 'bg-(--ui-primary)' : 'bg-transparent'"
          />

          <!-- 内容 -->
          <div class="flex-1 min-w-0">
            <div class="text-sm truncate">{{ conv.title }}</div>
            <div class="text-xs text-(--ui-text-dimmed) mt-0.5">
              {{ formatTime(conv.updatedAt) }}
            </div>
          </div>

          <!-- 删除按钮 -->
          <button
            class="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            :class="deleteConfirmId === conv.id ? 'bg-(--ui-error) text-white opacity-100' : 'hover:bg-(--ui-bg-elevated)'"
            :title="deleteConfirmId === conv.id ? '再次点击确认删除' : '删除'"
            @click.stop="handleDelete(conv.id)"
          >
            <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
          </button>
        </div>
      </button>
    </div>
  </div>
</template>

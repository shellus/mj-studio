<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'

const props = defineProps<{
  assistants: Assistant[]
  currentAssistantId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
}>()

// 排序后的助手列表：默认助手排在最前
const sortedAssistants = computed(() => {
  return [...props.assistants].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return 0
  })
})
</script>

<template>
  <div class="h-full flex flex-col bg-(--ui-bg-elevated) border-r border-(--ui-border)">
    <!-- 标题 -->
    <div class="p-4 border-b border-(--ui-border)">
      <h3 class="font-medium text-base">助手列表</h3>
    </div>

    <!-- 助手列表 -->
    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      <button
        v-for="assistant in sortedAssistants"
        :key="assistant.id"
        class="w-full p-3 text-left rounded-lg transition-colors"
        :class="assistant.id === currentAssistantId
          ? 'bg-(--ui-primary)/10 ring-1 ring-(--ui-primary)/30'
          : 'hover:bg-(--ui-bg) ring-1 ring-(--ui-border-accented)'"
        @click="emit('select', assistant.id)"
      >
        <div class="flex items-center gap-3">
          <!-- 头像 -->
          <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-(--ui-border)">
            <img
              v-if="assistant.avatar"
              :src="assistant.avatar"
              class="w-full h-full object-cover"
            />
            <UIcon
              v-else
              name="i-heroicons-user-circle"
              class="w-7 h-7 text-(--ui-text-muted)"
            />
          </div>

          <!-- 信息 -->
          <div class="flex-1 min-w-0">
            <div class="text-base font-medium truncate flex items-center gap-1.5">
              {{ assistant.name }}
              <UIcon
                v-if="assistant.isDefault"
                name="i-heroicons-star-solid"
                class="w-4 h-4 text-yellow-500"
              />
            </div>
            <div class="text-sm text-(--ui-text-muted)">
              {{ assistant.conversationCount }} 个对话
            </div>
          </div>

          <!-- 选中指示器 -->
          <span
            v-if="assistant.id === currentAssistantId"
            class="w-2 h-2 rounded-full bg-(--ui-primary) flex-shrink-0"
          />
        </div>
      </button>
    </div>

    <!-- 新建按钮 -->
    <div class="p-3 border-t border-(--ui-border)">
      <UButton
        variant="ghost"
        block
        @click="emit('create')"
      >
        <UIcon name="i-heroicons-plus" class="w-5 h-5 mr-1.5" />
        新建助手
      </UButton>
    </div>
  </div>
</template>

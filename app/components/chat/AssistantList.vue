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
</script>

<template>
  <div class="h-full flex flex-col bg-(--ui-bg-elevated) border-r border-(--ui-border)">
    <!-- 标题 -->
    <div class="p-3 border-b border-(--ui-border)">
      <h3 class="font-medium text-sm">助手列表</h3>
    </div>

    <!-- 助手列表 -->
    <div class="flex-1 overflow-y-auto">
      <button
        v-for="assistant in assistants"
        :key="assistant.id"
        class="w-full p-3 text-left hover:bg-(--ui-bg) transition-colors border-b border-(--ui-border)"
        :class="assistant.id === currentAssistantId ? 'bg-(--ui-bg)' : ''"
        @click="emit('select', assistant.id)"
      >
        <div class="flex items-center gap-2">
          <!-- 选中指示器 -->
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="assistant.id === currentAssistantId ? 'bg-(--ui-primary)' : 'bg-transparent'"
          />

          <!-- 头像 -->
          <div class="w-8 h-8 rounded-full bg-(--ui-bg) flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img
              v-if="assistant.avatar"
              :src="assistant.avatar"
              class="w-full h-full object-cover"
            />
            <UIcon
              v-else
              name="i-heroicons-user-circle"
              class="w-6 h-6 text-(--ui-text-muted)"
            />
          </div>

          <!-- 信息 -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate flex items-center gap-1">
              {{ assistant.name }}
              <UIcon
                v-if="assistant.isDefault"
                name="i-heroicons-star-solid"
                class="w-3 h-3 text-yellow-500"
              />
            </div>
            <div class="text-xs text-(--ui-text-muted) truncate">
              {{ assistant.description || '暂无简介' }}
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- 新建按钮 -->
    <div class="p-3 border-t border-(--ui-border)">
      <UButton
        variant="ghost"
        size="sm"
        block
        @click="emit('create')"
      >
        <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
        新建助手
      </UButton>
    </div>
  </div>
</template>

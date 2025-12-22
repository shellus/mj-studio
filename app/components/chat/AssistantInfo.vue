<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'

const props = defineProps<{
  assistant: Assistant | undefined
}>()

const emit = defineEmits<{
  edit: []
}>()
</script>

<template>
  <div v-if="assistant" class="p-3 border-b border-(--ui-border)">
    <div class="flex items-start gap-3">
      <!-- 头像 -->
      <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
        <img
          v-if="assistant.avatar"
          :src="assistant.avatar"
          class="w-full h-full object-cover"
        />
        <UIcon
          v-else
          name="i-heroicons-user-circle"
          class="w-8 h-8 text-(--ui-text-muted)"
        />
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm truncate">{{ assistant.name }}</span>
          <UIcon
            v-if="assistant.isDefault"
            name="i-heroicons-star-solid"
            class="w-3 h-3 text-yellow-500 flex-shrink-0"
          />
        </div>
        <div class="text-xs text-(--ui-text-muted) mt-0.5 line-clamp-2">
          {{ assistant.description || '暂无简介' }}
        </div>
      </div>

      <!-- 设置按钮 -->
      <button
        class="p-1.5 rounded hover:bg-(--ui-bg) transition-colors flex-shrink-0"
        title="编辑助手"
        @click="emit('edit')"
      >
        <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-(--ui-text-muted)" />
      </button>
    </div>

    <!-- 模型信息 -->
    <div v-if="assistant.modelName" class="mt-2 text-xs text-(--ui-text-dimmed) flex items-center gap-1">
      <UIcon name="i-heroicons-cpu-chip" class="w-3 h-3" />
      {{ assistant.modelName }}
    </div>
  </div>
</template>

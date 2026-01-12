<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'

const props = defineProps<{
  assistants: Assistant[]
  currentAssistantId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  pin: [id: number]
}>()

// 收藏的助手（按 pinnedAt 降序）
const pinnedAssistants = computed(() => {
  return props.assistants
    .filter(a => a.pinnedAt)
    .sort((a, b) => {
      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0
      return bTime - aTime
    })
})

// 未收藏的助手（按 lastActiveAt 降序，null 排最后）
const unpinnedAssistants = computed(() => {
  return props.assistants
    .filter(a => !a.pinnedAt)
    .sort((a, b) => {
      // null 排最后
      if (!a.lastActiveAt && !b.lastActiveAt) return 0
      if (!a.lastActiveAt) return 1
      if (!b.lastActiveAt) return -1
      const aTime = new Date(a.lastActiveAt).getTime()
      const bTime = new Date(b.lastActiveAt).getTime()
      return bTime - aTime
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
      <!-- 收藏区 -->
      <template v-if="pinnedAssistants.length > 0">
        <div class="text-xs text-(--ui-text-muted) px-2 py-1 flex items-center gap-1">
          <UIcon name="i-heroicons-bookmark-solid" class="w-3 h-3" />
          收藏
        </div>
        <button
          v-for="assistant in pinnedAssistants"
          :key="assistant.id"
          class="group w-full p-3 text-left rounded-lg transition-colors"
          :class="assistant.id === currentAssistantId
            ? 'bg-(--ui-primary)/10 ring-1 ring-(--ui-primary)/30'
            : 'hover:bg-(--ui-bg) ring-1 ring-(--ui-border-accented)'"
          @click="emit('select', assistant.id)"
        >
          <div class="flex items-center gap-3">
            <!-- 头像 -->
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-(--ui-border)">
              <img v-if="assistant.avatar" :src="assistant.avatar" class="w-full h-full object-cover" />
              <UIcon v-else name="i-heroicons-user-circle" class="w-7 h-7 text-(--ui-text-muted)" />
            </div>
            <!-- 信息 -->
            <div class="flex-1 min-w-0">
              <div class="text-base font-medium truncate flex items-center gap-1.5">
                {{ assistant.name }}
                <UIcon v-if="assistant.isDefault" name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
              </div>
              <div class="text-sm text-(--ui-text-muted)">{{ assistant.conversationCount }} 个对话</div>
            </div>
            <!-- 收藏按钮 -->
            <button
              class="p-1 rounded hover:bg-(--ui-bg-accented) text-(--ui-primary)"
              title="取消收藏"
              @click.stop="emit('pin', assistant.id)"
            >
              <UIcon name="i-heroicons-bookmark-solid" class="w-5 h-5" />
            </button>
          </div>
        </button>
      </template>

      <!-- 普通区分隔 -->
      <div v-if="pinnedAssistants.length > 0 && unpinnedAssistants.length > 0" class="text-xs text-(--ui-text-muted) px-2 py-1">
        全部
      </div>

      <!-- 普通区 -->
      <button
        v-for="assistant in unpinnedAssistants"
        :key="assistant.id"
        class="group w-full p-3 text-left rounded-lg transition-colors"
        :class="assistant.id === currentAssistantId
          ? 'bg-(--ui-primary)/10 ring-1 ring-(--ui-primary)/30'
          : 'hover:bg-(--ui-bg) ring-1 ring-(--ui-border-accented)'"
        @click="emit('select', assistant.id)"
      >
        <div class="flex items-center gap-3">
          <!-- 头像 -->
          <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-(--ui-border)">
            <img v-if="assistant.avatar" :src="assistant.avatar" class="w-full h-full object-cover" />
            <UIcon v-else name="i-heroicons-user-circle" class="w-7 h-7 text-(--ui-text-muted)" />
          </div>
          <!-- 信息 -->
          <div class="flex-1 min-w-0">
            <div class="text-base font-medium truncate flex items-center gap-1.5">
              {{ assistant.name }}
              <UIcon v-if="assistant.isDefault" name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
            </div>
            <div class="text-sm text-(--ui-text-muted)">{{ assistant.conversationCount }} 个对话</div>
          </div>
          <!-- 收藏按钮（hover 显示） -->
          <button
            class="p-1 rounded hover:bg-(--ui-bg-accented) text-(--ui-text-muted) opacity-0 group-hover:opacity-100 transition-opacity"
            title="收藏"
            @click.stop="emit('pin', assistant.id)"
          >
            <UIcon name="i-heroicons-bookmark" class="w-5 h-5" />
          </button>
        </div>
      </button>

      <!-- 新建按钮 -->
      <button
        class="w-full p-3 rounded-lg border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) hover:bg-(--ui-primary)/5 transition-colors flex items-center justify-center gap-2 text-(--ui-text-muted) hover:text-(--ui-primary)"
        @click="emit('create')"
      >
        <UIcon name="i-heroicons-plus" class="w-5 h-5" />
        <span>新建助手</span>
      </button>
    </div>
  </div>
</template>

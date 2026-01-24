<script setup lang="ts">
import type { McpServerDisplay, McpConnectionStatus } from '~/shared/types'

const props = defineProps<{
  server: McpServerDisplay
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'test'): void
  (e: 'toggle-active'): void
}>()

const statusConfig: Record<McpConnectionStatus, { color: string; label: string }> = {
  disconnected: { color: 'neutral', label: '未连接' },
  connecting: { color: 'warning', label: '连接中' },
  connected: { color: 'success', label: '已连接' },
  error: { color: 'error', label: '连接失败' },
}

const currentStatus = computed(() => {
  const status = props.server.connectionStatus || 'disconnected'
  return statusConfig[status]
})

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    sse: 'SSE',
    streamableHttp: 'HTTP',
    stdio: 'stdio',
  }
  return labels[props.server.type] || props.server.type
})
</script>

<template>
  <div
    class="flex items-center gap-3 p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 transition-colors"
  >
    <!-- Logo -->
    <div class="w-9 h-9 rounded-lg bg-(--ui-bg) flex items-center justify-center shrink-0">
      <img
        v-if="server.logoUrl"
        :src="server.logoUrl"
        class="w-5 h-5 object-contain"
      >
      <UIcon v-else name="i-heroicons-puzzle-piece" class="w-4 h-4 text-(--ui-text-muted)" />
    </div>

    <!-- 信息 -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="font-medium text-(--ui-text) truncate">{{ server.name }}</span>
        <UBadge :color="currentStatus.color as any" size="xs" variant="subtle">
          {{ currentStatus.label }}
        </UBadge>
      </div>

      <div class="flex items-center gap-2 text-xs text-(--ui-text-dimmed)">
        <span>{{ typeLabel }}</span>
        <span v-if="server.baseUrl" class="truncate max-w-[200px]">{{ server.baseUrl }}</span>
        <span v-if="server.toolCount !== undefined">{{ server.toolCount }} 个工具</span>
      </div>
    </div>

    <!-- 操作 -->
    <div class="flex items-center gap-1 shrink-0">
      <USwitch
        :model-value="server.isActive"
        size="xs"
        @update:model-value="emit('toggle-active')"
      />

      <UDropdownMenu
        :items="[
          [
            { label: '测试连接', icon: 'i-heroicons-signal', onSelect: () => emit('test') },
            { label: '编辑', icon: 'i-heroicons-pencil', onSelect: () => emit('edit') },
          ],
          [
            { label: '删除', icon: 'i-heroicons-trash', color: 'error' as const, onSelect: () => emit('delete') },
          ],
        ]"
      >
        <UButton variant="ghost" color="neutral" icon="i-heroicons-ellipsis-vertical" size="xs" />
      </UDropdownMenu>
    </div>
  </div>
</template>

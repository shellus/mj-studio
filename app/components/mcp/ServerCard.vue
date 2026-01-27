<script setup lang="ts">
import type { McpServerDisplay, McpTool, McpConnectionStatus } from '~/shared/types'

const props = defineProps<{
  server: McpServerDisplay
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'test'): void
  (e: 'toggle-active'): void
  (e: 'update-auto-approve', tools: string[]): void
}>()

// 展开状态
const expanded = ref(false)
const isLoadingTools = ref(false)
const tools = ref<McpTool[]>([])

const { fetchTools } = useMcpServers()

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

// 展开/收起工具列表
async function toggleExpand() {
  if (!expanded.value) {
    // 展开时加载工具
    isLoadingTools.value = true
    try {
      tools.value = await fetchTools(props.server.id)
    } catch (e) {
      console.error('加载工具失败:', e)
    } finally {
      isLoadingTools.value = false
    }
  }
  expanded.value = !expanded.value
}

// 是否全选
const isAllSelected = computed(() => {
  if (tools.value.length === 0) return false
  return tools.value.every(t => props.server.autoApproveTools.includes(t.name))
})

// 全选/取消全选
function toggleSelectAll() {
  if (isAllSelected.value) {
    // 取消全选
    emit('update-auto-approve', [])
  } else {
    // 全选
    emit('update-auto-approve', tools.value.map(t => t.name))
  }
}

// 切换工具的自动通过状态
function toggleAutoApprove(toolName: string) {
  const currentList = [...props.server.autoApproveTools]
  const index = currentList.indexOf(toolName)
  if (index >= 0) {
    currentList.splice(index, 1)
  } else {
    currentList.push(toolName)
  }
  emit('update-auto-approve', currentList)
}

// 检查工具是否自动通过
function isAutoApprove(toolName: string): boolean {
  return props.server.autoApproveTools.includes(toolName)
}
</script>

<template>
  <div class="rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 transition-colors">
    <!-- 主行 -->
    <div class="flex items-center gap-3 p-3">
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
        <!-- 展开工具按钮 -->
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          :icon="expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          title="展开工具列表"
          @click="toggleExpand"
        />

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

    <!-- 工具列表（展开时显示） -->
    <div v-if="expanded" class="border-t border-(--ui-border) px-3 py-2">
      <!-- 加载中 -->
      <div v-if="isLoadingTools" class="flex items-center justify-center py-4">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <!-- 工具列表 -->
      <div v-else-if="tools.length > 0" class="space-y-1">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-(--ui-text-muted)">勾选"自动通过"的工具调用时无需手动确认</p>
          <button
            class="text-xs text-(--ui-primary) hover:underline"
            @click="toggleSelectAll"
          >
            {{ isAllSelected ? '取消全选' : '全选' }}
          </button>
        </div>
        <div
          v-for="tool in tools"
          :key="tool.name"
          class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-(--ui-bg) transition-colors"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-(--ui-text) truncate">{{ tool.displayName }}</div>
            <div class="text-xs text-(--ui-text-dimmed) truncate">{{ tool.description }}</div>
          </div>
          <label class="flex items-center gap-1.5 shrink-0 cursor-pointer select-none">
            <UCheckbox
              :model-value="isAutoApprove(tool.name)"
              size="xs"
              @update:model-value="toggleAutoApprove(tool.name)"
            />
            <span class="text-xs text-(--ui-text-muted)">自动通过</span>
          </label>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-4 text-sm text-(--ui-text-muted)">
        暂无工具，请先测试连接
      </div>
    </div>
  </div>
</template>

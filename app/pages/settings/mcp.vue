<script setup lang="ts">
import type { McpServerDisplay } from '~/shared/types'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()

// ==================== MCP 客户端（调用外部服务）====================

const {
  servers,
  isLoading: isLoadingServers,
  fetchServers,
  createServer,
  updateServer,
  deleteServer,
  testConnection,
} = useMcpServers()

// 模态框状态
const showEditModal = ref(false)
const editingServer = ref<McpServerDisplay | null>(null)

function openAddModal() {
  editingServer.value = null
  showEditModal.value = true
}

function openEditModal(server: McpServerDisplay) {
  editingServer.value = server
  showEditModal.value = true
}

async function handleSave(data: {
  name: string
  description?: string
  type?: 'sse' | 'streamableHttp' | 'stdio'
  baseUrl?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  timeout: number
  logoUrl?: string
}) {
  try {
    if (editingServer.value) {
      await updateServer(editingServer.value.id, data)
      toast.add({ title: '服务已更新', color: 'success' })
    } else {
      await createServer(data)
      toast.add({ title: '服务已添加', color: 'success' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    toast.add({ title: '操作失败', description: message, color: 'error' })
  }
}

async function handleSaveBatch(dataList: Array<{
  name: string
  description?: string
  type?: 'sse' | 'streamableHttp' | 'stdio'
  baseUrl?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  timeout: number
  logoUrl?: string
}>) {
  let successCount = 0
  let failCount = 0

  for (const data of dataList) {
    try {
      await createServer(data)
      successCount++
    } catch {
      failCount++
    }
  }

  if (successCount > 0) {
    toast.add({ title: `成功添加 ${successCount} 个服务`, color: 'success' })
  }
  if (failCount > 0) {
    toast.add({ title: `${failCount} 个服务添加失败`, color: 'error' })
  }
}

async function handleDelete(server: McpServerDisplay) {
  if (!confirm(`确定要删除服务 "${server.name}" 吗？`)) return

  try {
    await deleteServer(server.id)
    toast.add({ title: '服务已删除', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    toast.add({ title: '删除失败', description: message, color: 'error' })
  }
}

async function handleTest(server: McpServerDisplay) {
  try {
    const result = await testConnection(server.id)
    if (result.success) {
      toast.add({ title: '连接成功', description: `发现 ${result.toolCount} 个工具`, color: 'success' })
    } else {
      toast.add({ title: '连接失败', description: result.error, color: 'error' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '测试失败'
    toast.add({ title: '测试失败', description: message, color: 'error' })
  }
}

async function handleToggleActive(server: McpServerDisplay) {
  try {
    await updateServer(server.id, { isActive: !server.isActive })
    toast.add({ title: server.isActive ? '服务已禁用' : '服务已启用', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    toast.add({ title: '操作失败', description: message, color: 'error' })
  }
}

async function handleUpdateAutoApprove(server: McpServerDisplay, tools: string[]) {
  try {
    await updateServer(server.id, { autoApproveTools: tools })
    toast.add({ title: '自动通过设置已更新', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    toast.add({ title: '操作失败', description: message, color: 'error' })
  }
}

onMounted(() => {
  fetchServers()
})
</script>

<template>
  <SettingsLayout>
    <!-- MCP 客户端（调用外部服务）-->
    <div class="mb-8">
      <div class="mb-4">
        <h2 class="text-lg font-medium text-(--ui-text)">MCP 服务</h2>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          连接外部 MCP 服务，让 AI 助手获得扩展能力
        </p>
      </div>

      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-medium text-(--ui-text)">服务列表</h3>
          <UButton icon="i-heroicons-plus" @click="openAddModal">
            添加 MCP 服务
          </UButton>
        </div>

        <div v-if="isLoadingServers" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-(--ui-text-dimmed) animate-spin" />
        </div>

        <div v-else class="space-y-2">
          <!-- 服务列表 -->
          <McpServerCard
            v-for="server in servers"
            :key="server.id"
            :server="server"
            @edit="openEditModal(server)"
            @delete="handleDelete(server)"
            @test="handleTest(server)"
            @toggle-active="handleToggleActive(server)"
            @update-auto-approve="handleUpdateAutoApprove(server, $event)"
          />

          <!-- 空状态 -->
          <div v-if="servers.length === 0" class="text-center py-8 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-puzzle-piece" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无 MCP 服务</p>
            <p class="text-sm mt-1">添加服务后，可在助手设置中启用</p>
          </div>
        </div>
      </div>

      <!-- 服务编辑模态框 -->
      <McpServerEditModal
        v-model:open="showEditModal"
        v-model:server="editingServer"
        @save="handleSave"
        @save-batch="handleSaveBatch"
      />
    </div>
  </SettingsLayout>
</template>

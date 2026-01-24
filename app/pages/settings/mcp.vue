<script setup lang="ts">
import type { McpServerDisplay } from '~/shared/types'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()

// ==================== MCP 服务端（对外服务）====================

// API Key 状态
const apiKey = ref<string | null>(null)
const isLoading = ref(true)
const isGenerating = ref(false)
const showKey = ref(false)

// 系统配置状态
const publicUrlConfigured = ref(true)

// 获取当前 API Key 和系统配置
async function fetchApiKeyData() {
  isLoading.value = true
  try {
    const [keyResult, configResult] = await Promise.all([
      $fetch<{ mcpApiKey: string | null }>('/api/user/mcp-key'),
      $fetch<{ publicUrlConfigured: boolean }>('/api/system/config'),
    ])
    apiKey.value = keyResult.mcpApiKey || null
    publicUrlConfigured.value = configResult.publicUrlConfigured
  } catch (error) {
    console.error('获取数据失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 生成/重新生成 API Key
async function generateApiKey() {
  isGenerating.value = true
  try {
    const result = await $fetch<{ mcpApiKey: string }>('/api/user/mcp-key', {
      method: 'POST',
    })
    apiKey.value = result.mcpApiKey
    showKey.value = true
    toast.add({ title: '已生成新的 API Key', color: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败'
    toast.add({ title: '生成 API Key 失败', description: message, color: 'error' })
  } finally {
    isGenerating.value = false
  }
}

// 复制 API Key
async function copyApiKey() {
  if (!apiKey.value) return
  try {
    await navigator.clipboard.writeText(apiKey.value)
    toast.add({ title: '已复制到剪贴板', color: 'success' })
  } catch (error) {
    toast.add({ title: '复制失败', color: 'error' })
  }
}

// MCP 服务器 URL
const mcpServerUrl = computed(() => {
  if (import.meta.client) {
    return `${window.location.origin}/api/mcp`
  }
  return '/api/mcp'
})

// 复制 URL
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(mcpServerUrl.value)
    toast.add({ title: '已复制到剪贴板', color: 'success' })
  } catch (error) {
    toast.add({ title: '复制失败', color: 'error' })
  }
}

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

onMounted(() => {
  fetchApiKeyData()
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

    <!-- 分割线 -->
    <hr class="border-(--ui-border) mb-8">

    <!-- MCP 服务端（对外服务）-->
    <div class="mb-4">
      <h2 class="text-lg font-medium text-(--ui-text)">MCP 接口</h2>
      <p class="text-sm text-(--ui-text-muted) mt-1">
        通过 MCP 协议让外部 AI（如 Claude Desktop、Cursor）调用本系统的 AI 能力
      </p>
    </div>

    <!-- PUBLIC_URL 未配置警告 -->
    <UAlert
      v-if="!isLoading && !publicUrlConfigured"
      color="warning"
      icon="i-heroicons-exclamation-triangle"
      title="PUBLIC_URL 未配置"
      description="MCP 返回的资源链接将使用相对路径。请在 .env 文件中设置 PUBLIC_URL 环境变量以获取完整的资源 URL。"
      class="mb-4"
    />

    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <div v-else class="space-y-4">
      <!-- API Key 管理 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <h3 class="text-base font-medium text-(--ui-text) mb-4">API Key</h3>

        <div v-if="apiKey" class="space-y-4">
          <div class="flex items-center gap-2">
            <UInput
              :model-value="showKey ? apiKey : apiKey.replace(/./g, '•')"
              readonly
              class="flex-1 font-mono"
            />
            <UButton
              variant="ghost"
              color="neutral"
              :icon="showKey ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
              @click="showKey = !showKey"
            />
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              @click="copyApiKey"
            />
          </div>

          <div class="flex items-center justify-between">
            <p class="text-sm text-(--ui-text-muted)">
              重新生成将使旧的 Key 立即失效
            </p>
            <UButton
              variant="soft"
              color="warning"
              :loading="isGenerating"
              @click="generateApiKey"
            >
              重新生成
            </UButton>
          </div>
        </div>

        <div v-else class="text-center py-6">
          <p class="text-(--ui-text-muted) mb-4">尚未生成 API Key</p>
          <UButton :loading="isGenerating" @click="generateApiKey">
            生成 API Key
          </UButton>
        </div>
      </div>

      <!-- 服务器配置 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <h3 class="text-base font-medium text-(--ui-text) mb-4">服务器配置</h3>

        <div class="space-y-4">
          <div>
            <label class="text-sm text-(--ui-text-muted) mb-2 block">MCP 服务器 URL</label>
            <div class="flex items-center gap-2">
              <UInput
                :model-value="mcpServerUrl"
                readonly
                class="flex-1 font-mono text-sm"
              />
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                @click="copyUrl"
              />
            </div>
          </div>

          <div class="p-4 bg-(--ui-bg) rounded-lg border border-(--ui-border)">
            <p class="text-sm text-(--ui-text-muted) mb-2">Claude Desktop 配置示例：</p>
            <pre class="text-xs font-mono text-(--ui-text) whitespace-pre-wrap break-all">{
  "mcpServers": {
    "mj-studio": {
      "url": "{{ mcpServerUrl }}",
      "headers": {
        "Authorization": "Bearer {{ apiKey || 'YOUR_API_KEY' }}"
      }
    }
  }
}</pre>
          </div>
        </div>
      </div>

      <!-- 可用工具说明 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <h3 class="text-base font-medium text-(--ui-text) mb-4">可用工具</h3>

        <div class="grid gap-3">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-(--ui-primary)/10 flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4 text-(--ui-primary)" />
            </div>
            <div>
              <p class="text-sm font-medium text-(--ui-text)">AI 对话</p>
              <p class="text-xs text-(--ui-text-muted)">list_assistants, list_conversations, get_conversation, chat</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-photo" class="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p class="text-sm font-medium text-(--ui-text)">图片生成</p>
              <p class="text-xs text-(--ui-text-muted)">list_models, generate_image, get_task, list_tasks</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-film" class="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p class="text-sm font-medium text-(--ui-text)">视频生成</p>
              <p class="text-xs text-(--ui-text-muted)">list_models, generate_video, get_task, list_tasks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

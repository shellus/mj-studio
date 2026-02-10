<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const toast = useToast()

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

// HTTP API URL
const httpApiUrl = computed(() => {
  if (import.meta.client) {
    return window.location.origin
  }
  return ''
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

onMounted(() => {
  fetchApiKeyData()
})
</script>

<template>
  <SettingsLayout>
    <!-- API Key 管理 -->
    <div class="mb-4">
      <h2 class="text-lg font-medium text-(--ui-text)">API 管理</h2>
      <p class="text-sm text-(--ui-text-muted) mt-1">
        管理 API Key，通过 MCP 协议或 HTTP API 让外部工具调用本系统的 AI 能力
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

      <!-- 分割线 -->
      <hr class="border-(--ui-border)">

      <!-- MCP 接口 -->
      <div class="mb-4">
        <h2 class="text-lg font-medium text-(--ui-text)">MCP 接口</h2>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          通过 MCP 协议让外部 AI（如 Claude Desktop、Cursor）调用本系统的 AI 能力
        </p>
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

      <!-- 分割线 -->
      <hr class="border-(--ui-border)">

      <!-- HTTP API -->
      <div class="mb-4">
        <h2 class="text-lg font-medium text-(--ui-text)">HTTP API</h2>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          通过标准 HTTP 请求调用本系统的 AI 对话能力，适用于脚本、自动化工具等场景
        </p>
      </div>

      <div class="space-y-4">
        <!-- 对话接口 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
          <h3 class="text-base font-medium text-(--ui-text) mb-4">POST /api/external/chat</h3>
          <p class="text-sm text-(--ui-text-muted) mb-4">向指定助手发送消息并获取 AI 回复。</p>

          <!-- 请求参数表格 -->
          <div class="mb-4">
            <p class="text-sm font-medium text-(--ui-text) mb-2">请求参数</p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-(--ui-border)">
                    <th class="text-left py-2 pr-4 text-(--ui-text-muted) font-medium">参数</th>
                    <th class="text-left py-2 pr-4 text-(--ui-text-muted) font-medium">类型</th>
                    <th class="text-left py-2 pr-4 text-(--ui-text-muted) font-medium">必填</th>
                    <th class="text-left py-2 text-(--ui-text-muted) font-medium">说明</th>
                  </tr>
                </thead>
                <tbody class="text-(--ui-text)">
                  <tr class="border-b border-(--ui-border)/50">
                    <td class="py-2 pr-4 font-mono">assistantId</td>
                    <td class="py-2 pr-4">number</td>
                    <td class="py-2 pr-4">是</td>
                    <td class="py-2">助手 ID</td>
                  </tr>
                  <tr class="border-b border-(--ui-border)/50">
                    <td class="py-2 pr-4 font-mono">message</td>
                    <td class="py-2 pr-4">string</td>
                    <td class="py-2 pr-4">是</td>
                    <td class="py-2">用户消息内容</td>
                  </tr>
                  <tr class="border-b border-(--ui-border)/50">
                    <td class="py-2 pr-4 font-mono">conversationId</td>
                    <td class="py-2 pr-4">number</td>
                    <td class="py-2 pr-4">否</td>
                    <td class="py-2">对话 ID，不传则创建新对话</td>
                  </tr>
                  <tr class="border-b border-(--ui-border)/50">
                    <td class="py-2 pr-4 font-mono">title</td>
                    <td class="py-2 pr-4">string</td>
                    <td class="py-2 pr-4">否</td>
                    <td class="py-2">对话标题，仅新建对话时有效</td>
                  </tr>
                  <tr class="border-b border-(--ui-border)/50">
                    <td class="py-2 pr-4 font-mono">stream</td>
                    <td class="py-2 pr-4">boolean</td>
                    <td class="py-2 pr-4">否</td>
                    <td class="py-2">是否流式响应，默认 false</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 font-mono">aimodelId</td>
                    <td class="py-2 pr-4">number</td>
                    <td class="py-2 pr-4">否</td>
                    <td class="py-2">一次性模型 ID，本次请求使用该模型</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- curl 示例 -->
          <div class="p-4 bg-(--ui-bg) rounded-lg border border-(--ui-border)">
            <p class="text-sm text-(--ui-text-muted) mb-2">curl 示例：</p>
            <pre class="text-xs font-mono text-(--ui-text) whitespace-pre-wrap break-all">curl -X POST {{ httpApiUrl }}/api/external/chat \
  -H "Authorization: Bearer {{ apiKey || 'YOUR_API_KEY' }}" \
  -H "Content-Type: application/json" \
  -d '{
  "assistantId": 1,
  "message": "你好"
}'</pre>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

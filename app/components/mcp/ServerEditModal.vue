<script setup lang="ts">
import type { McpServerDisplay, McpServerType } from '~/shared/types'

interface ServerFormData {
  name: string
  description?: string
  type?: McpServerType
  baseUrl?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  timeout: number
  logoUrl?: string
}

const emit = defineEmits<{
  save: [data: ServerFormData]
  saveBatch: [data: ServerFormData[]]
}>()

const open = defineModel<boolean>('open', { default: false })
const editingServer = defineModel<McpServerDisplay | null>('server', { default: null })

// 输入模式：form 或 json
const inputMode = ref<'form' | 'json'>('form')
const jsonInput = ref('')
const jsonError = ref('')

// 服务类型：http 或 stdio
const serverType = ref<'http' | 'stdio'>('http')

// 表单数据
const form = reactive({
  name: '',
  description: '',
  baseUrl: '',
  headers: '',
  command: '',
  args: '',
  env: '',
  timeout: 60,
  logoUrl: '',
})

// 监听编辑模型变化
watch(editingServer, (server) => {
  if (server) {
    form.name = server.name
    form.description = server.description || ''
    form.baseUrl = server.baseUrl || ''
    form.headers = ''
    form.command = server.command || ''
    form.args = server.args?.join('\n') || ''
    form.env = ''
    form.timeout = server.timeout
    form.logoUrl = server.logoUrl || ''
    serverType.value = server.type === 'stdio' ? 'stdio' : 'http'
    inputMode.value = 'form'
  } else {
    // 重置表单
    form.name = ''
    form.description = ''
    form.baseUrl = ''
    form.headers = ''
    form.command = ''
    form.args = ''
    form.env = ''
    form.timeout = 60
    form.logoUrl = ''
    serverType.value = 'http'
    jsonInput.value = ''
    jsonError.value = ''
  }
}, { immediate: true })

// 是否编辑模式
const isEdit = computed(() => !!editingServer.value?.id)

// 模态框标题
const modalTitle = computed(() => isEdit.value ? '编辑服务' : '添加服务')

// 类型提示
const typeHint = computed(() => {
  if (!form.baseUrl) return ''
  return form.baseUrl.endsWith('/mcp')
    ? '将使用 StreamableHTTP 传输'
    : '将使用 SSE 传输'
})

// 解析请求头（KEY=value 格式）
function parseHeaders(str: string): Record<string, string> | undefined {
  if (!str.trim()) return undefined

  const result: Record<string, string> = {}
  for (const line of str.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) {
      result[key.trim()] = rest.join('=').trim()
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// 解析 JSON 配置（支持批量）
function parseJsonConfig(json: string): ServerFormData[] | null {
  try {
    const config = JSON.parse(json)
    jsonError.value = ''

    // 支持 Claude Desktop 格式: { "mcpServers": { "name": { url/command, ... } } }
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      const results: ServerFormData[] = []
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        const cfg = serverConfig as Record<string, unknown>
        // stdio 类型
        if (cfg.command) {
          results.push({
            name: serverName,
            type: 'stdio',
            command: cfg.command as string,
            args: cfg.args as string[] | undefined,
            env: cfg.env as Record<string, string> | undefined,
            timeout: (cfg.timeout as number) || 60,
          })
        } else {
          // HTTP 类型
          results.push({
            name: serverName,
            baseUrl: (cfg.url || cfg.baseUrl) as string | undefined,
            headers: cfg.headers as Record<string, string> | undefined,
            timeout: (cfg.timeout as number) || 60,
          })
        }
      }
      if (results.length > 0) return results
    }

    // 直接格式（单个服务）
    if (config.command) {
      return [{
        name: config.name || '',
        type: 'stdio',
        command: config.command,
        args: config.args,
        env: config.env,
        timeout: config.timeout || 60,
      }]
    }
    if (config.url || config.baseUrl || config.name) {
      return [{
        name: config.name || '',
        description: config.description,
        baseUrl: config.url || config.baseUrl,
        headers: config.headers,
        timeout: config.timeout || 60,
        logoUrl: config.logoUrl,
      }]
    }

    jsonError.value = '无法识别的 JSON 格式'
    return null
  } catch {
    jsonError.value = 'JSON 格式错误'
    return null
  }
}

// 解析参数列表（每行一个）
function parseArgs(str: string): string[] | undefined {
  if (!str.trim()) return undefined
  return str.split('\n').map(s => s.trim()).filter(Boolean)
}

// 保存
function onSave() {
  if (inputMode.value === 'json' && !isEdit.value) {
    const parsed = parseJsonConfig(jsonInput.value)
    if (!parsed) return
    // 批量导入
    emit('saveBatch', parsed)
    open.value = false
    return
  }

  let data: ServerFormData
  if (serverType.value === 'stdio') {
    data = {
      name: form.name,
      description: form.description || undefined,
      type: 'stdio',
      command: form.command || undefined,
      args: parseArgs(form.args),
      env: parseHeaders(form.env),
      timeout: form.timeout,
    }
  } else {
    data = {
      name: form.name,
      description: form.description || undefined,
      baseUrl: form.baseUrl || undefined,
      headers: parseHeaders(form.headers),
      timeout: form.timeout,
      logoUrl: form.logoUrl || undefined,
    }
  }

  emit('save', data)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <!-- 模式切换（仅新增时显示） -->
      <div v-if="!isEdit" class="flex gap-2 mb-4">
        <UButton
          size="xs"
          :variant="inputMode === 'form' ? 'solid' : 'outline'"
          :color="inputMode === 'form' ? 'primary' : 'neutral'"
          @click="inputMode = 'form'"
        >
          表单填写
        </UButton>
        <UButton
          size="xs"
          :variant="inputMode === 'json' ? 'solid' : 'outline'"
          :color="inputMode === 'json' ? 'primary' : 'neutral'"
          @click="inputMode = 'json'"
        >
          JSON 导入
        </UButton>
      </div>

      <!-- JSON 输入模式 -->
      <div v-if="inputMode === 'json' && !isEdit" class="space-y-4">
        <UFormField label="JSON 配置" :error="jsonError">
          <UTextarea
            v-model="jsonInput"
            placeholder='{"mcpServers":{"name":{"url":"https://...","headers":{"Authorization":"Bearer ..."}}}}'
            :rows="10"
            class="w-full font-mono text-sm"
          />
        </UFormField>
        <div class="text-xs text-(--ui-text-muted) space-y-1">
          <p>支持以下格式：</p>
          <p>1. Claude Desktop 格式：<code class="px-1 py-0.5 rounded bg-(--ui-bg-muted)">{"mcpServers":{"name":{...}}}</code></p>
          <p>2. 直接格式：<code class="px-1 py-0.5 rounded bg-(--ui-bg-muted)">{"name":"...","url":"..."}</code></p>
        </div>
      </div>

      <!-- 表单模式 -->
      <div v-else class="space-y-4">
        <UFormField label="名称">
          <UInput v-model="form.name" placeholder="如：GitHub MCP" class="w-full" />
        </UFormField>

        <UFormField label="描述">
          <UTextarea v-model="form.description" placeholder="服务用途说明" :rows="2" class="w-full" />
        </UFormField>

        <!-- 服务类型选择 -->
        <UFormField label="服务类型">
          <div class="flex gap-2">
            <UButton
              size="xs"
              :variant="serverType === 'http' ? 'solid' : 'outline'"
              :color="serverType === 'http' ? 'primary' : 'neutral'"
              @click="serverType = 'http'"
            >
              HTTP
            </UButton>
            <UButton
              size="xs"
              :variant="serverType === 'stdio' ? 'solid' : 'outline'"
              :color="serverType === 'stdio' ? 'primary' : 'neutral'"
              @click="serverType = 'stdio'"
            >
              stdio
            </UButton>
          </div>
        </UFormField>

        <!-- HTTP 模式字段 -->
        <template v-if="serverType === 'http'">
          <UFormField label="服务地址" :hint="typeHint">
            <UInput v-model="form.baseUrl" placeholder="https://api.example.com/mcp" class="w-full" />
          </UFormField>

          <UFormField label="请求头" hint="每行一个，格式：KEY=value">
            <UTextarea
              v-model="form.headers"
              placeholder="Authorization=Bearer sk-xxx"
              :rows="3"
              class="w-full font-mono"
            />
          </UFormField>

          <UFormField label="图标 URL">
            <UInput v-model="form.logoUrl" placeholder="https://example.com/logo.png" class="w-full" />
          </UFormField>
        </template>

        <!-- stdio 模式字段 -->
        <template v-if="serverType === 'stdio'">
          <UFormField label="命令" hint="可执行命令，如 npx、node、python">
            <UInput v-model="form.command" placeholder="npx" class="w-full font-mono" />
          </UFormField>

          <UFormField label="参数" hint="每行一个参数">
            <UTextarea
              v-model="form.args"
              placeholder="-y
@anthropic/mcp-server-filesystem
/path/to/dir"
              :rows="4"
              class="w-full font-mono"
            />
          </UFormField>

          <UFormField label="环境变量" hint="每行一个，格式：KEY=value">
            <UTextarea
              v-model="form.env"
              placeholder="API_KEY=xxx"
              :rows="3"
              class="w-full font-mono"
            />
          </UFormField>
        </template>

        <UFormField label="超时时间（秒）">
          <UInput v-model.number="form.timeout" type="number" :min="1" :max="600" class="w-24" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="outline" color="neutral" @click="open = false">取消</UButton>
        <UButton @click="onSave">保存</UButton>
      </div>
    </template>
  </UModal>
</template>

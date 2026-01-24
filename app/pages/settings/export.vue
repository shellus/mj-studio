<script setup lang="ts">
import type { Conversation, Message } from '~/composables/useConversations'
import type { MessageMark } from '~/shared/types'

const { assistants, isLoading: isLoadingAssistants, createAssistant } = useAssistants()
const { upstreams, isLoading: isLoadingUpstreams, loadUpstreams, createUpstream } = useUpstreams()
const toast = useToast()

// 加载状态
const isLoading = ref(true)
const isExporting = ref(false)

// 导入文件输入
const fileInputRef = ref<HTMLInputElement | null>(null)

// 选中状态
const selectedAssistantIds = ref<Set<number>>(new Set())
const selectedUpstreamIds = ref<Set<number>>(new Set())

// 对话相关状态
const selectedAssistantForConv = ref<number | null>(null)
const conversationsForExport = ref<Conversation[]>([])
const selectedConversationIds = ref<Set<number>>(new Set())
const isLoadingConversations = ref(false)

// 加载数据
onMounted(async () => {
  // 加载上游数据
  if (upstreams.value.length === 0) {
    loadUpstreams()
  }
  // 等待助手数据加载完成
  while (isLoadingAssistants.value) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  isLoading.value = false
})

// 助手选择
const isAllAssistantsSelected = computed(() =>
  assistants.value.length > 0 && selectedAssistantIds.value.size === assistants.value.length
)

function toggleAssistant(id: number) {
  if (selectedAssistantIds.value.has(id)) {
    selectedAssistantIds.value.delete(id)
  } else {
    selectedAssistantIds.value.add(id)
  }
  selectedAssistantIds.value = new Set(selectedAssistantIds.value)
}

function toggleAllAssistants() {
  if (isAllAssistantsSelected.value) {
    selectedAssistantIds.value = new Set()
  } else {
    selectedAssistantIds.value = new Set(assistants.value.map(a => a.id))
  }
}

// 上游配置选择
const isAllUpstreamsSelected = computed(() =>
  upstreams.value.length > 0 && selectedUpstreamIds.value.size === upstreams.value.length
)

function toggleUpstream(id: number) {
  if (selectedUpstreamIds.value.has(id)) {
    selectedUpstreamIds.value.delete(id)
  } else {
    selectedUpstreamIds.value.add(id)
  }
  selectedUpstreamIds.value = new Set(selectedUpstreamIds.value)
}

function toggleAllUpstreams() {
  if (isAllUpstreamsSelected.value) {
    selectedUpstreamIds.value = new Set()
  } else {
    selectedUpstreamIds.value = new Set(upstreams.value.map(u => u.id))
  }
}

// 对话选择
const isAllConversationsSelected = computed(() =>
  conversationsForExport.value.length > 0 && selectedConversationIds.value.size === conversationsForExport.value.length
)

function toggleConversation(id: number) {
  if (selectedConversationIds.value.has(id)) {
    selectedConversationIds.value.delete(id)
  } else {
    selectedConversationIds.value.add(id)
  }
  selectedConversationIds.value = new Set(selectedConversationIds.value)
}

function toggleAllConversations() {
  if (isAllConversationsSelected.value) {
    selectedConversationIds.value = new Set()
  } else {
    selectedConversationIds.value = new Set(conversationsForExport.value.map(c => c.id))
  }
}

// 选择助手加载对话
async function selectAssistantForConv(assistantId: number) {
  if (selectedAssistantForConv.value === assistantId) {
    // 取消选择
    selectedAssistantForConv.value = null
    conversationsForExport.value = []
    selectedConversationIds.value = new Set()
    return
  }

  selectedAssistantForConv.value = assistantId
  selectedConversationIds.value = new Set()
  isLoadingConversations.value = true

  try {
    const result = await $fetch<Conversation[]>('/api/conversations', {
      query: { assistantId }
    })
    conversationsForExport.value = result
  } catch (e) {
    console.error('加载对话失败:', e)
    conversationsForExport.value = []
  } finally {
    isLoadingConversations.value = false
  }
}

// 将本地文件 URL 转换为 Base64
async function urlToBase64(url: string): Promise<string | null> {
  if (!url || !url.startsWith('/api/files/')) return null

  try {
    const result = await $fetch<{ base64: string }>('/api/files/to-base64', {
      method: 'POST',
      body: { url }
    })
    return result.base64
  } catch (e) {
    console.warn('转换文件失败:', url, e)
    return null
  }
}

// 将 Base64 保存为本地文件并返回 URL
async function base64ToUrl(base64: string): Promise<string | null> {
  if (!base64 || !base64.startsWith('data:')) return null

  try {
    const result = await $fetch<{ url: string }>('/api/files/from-base64', {
      method: 'POST',
      body: { base64 }
    })
    return result.url
  } catch (e) {
    console.warn('保存文件失败:', e)
    return null
  }
}

// 导出选中项
async function handleExport() {
  const selectedAssistants = assistants.value.filter(a => selectedAssistantIds.value.has(a.id))
  const selectedUpstreamsData = upstreams.value.filter(u => selectedUpstreamIds.value.has(u.id))
  const hasConversations = selectedConversationIds.value.size > 0

  if (selectedAssistants.length === 0 && selectedUpstreamsData.length === 0 && !hasConversations) {
    toast.add({ title: '请先选择要导出的项目', color: 'warning' })
    return
  }

  isExporting.value = true

  try {
    // 处理助手导出（头像 URL 转 Base64）
    const exportedAssistants = await Promise.all(
      selectedAssistants.map(async (a) => {
        let avatarBase64: string | undefined

        // 如果头像是本地 URL，转为 Base64
        if (a.avatar && a.avatar.startsWith('/api/files/')) {
          avatarBase64 = (await urlToBase64(a.avatar)) || undefined
        } else if (a.avatar?.startsWith('data:')) {
          // 已经是 Base64
          avatarBase64 = a.avatar
        }

        // 查找助手关联的模型信息
        let upstreamName: string | undefined
        let aimodelName: string | undefined
        if (a.aimodelId) {
          const upstream = upstreams.value.find(u => u.aimodels?.some(m => m.id === a.aimodelId))
          if (upstream) {
            upstreamName = upstream.name
            const aimodel = upstream.aimodels?.find(m => m.id === a.aimodelId)
            if (aimodel) {
              aimodelName = aimodel.name
            }
          }
        }

        return {
          name: a.name,
          description: a.description,
          avatar: avatarBase64,
          systemPrompt: a.systemPrompt,
          isDefault: a.isDefault,
          enableThinking: a.enableThinking,
          upstreamName,
          aimodelName,
        }
      })
    )

    // 处理对话导出
    interface ExportedMessage {
      role: 'user' | 'assistant' | 'tool'
      content: string
      modelDisplayName: string | null
      mark: MessageMark | null
      createdAt: string
    }

    interface ExportedConversation {
      assistantName: string
      title: string
      createdAt: string
      messages: ExportedMessage[]
    }

    const exportedConversations: ExportedConversation[] = []

    for (const convId of selectedConversationIds.value) {
      try {
        const detail = await $fetch<{ conversation: Conversation; messages: Message[] }>(
          `/api/conversations/${convId}`
        )
        const assistant = assistants.value.find(a => a.id === detail.conversation.assistantId)
        exportedConversations.push({
          assistantName: assistant?.name || '',
          title: detail.conversation.title,
          createdAt: detail.conversation.createdAt,
          messages: detail.messages.map(m => ({
            role: m.role,
            content: m.content,
            modelDisplayName: m.modelDisplayName,
            mark: m.mark || null,
            createdAt: m.createdAt,
          }))
        })
      } catch (e) {
        console.error('导出对话失败:', convId, e)
      }
    }

    const exportData = {
      version: 3,
      exportedAt: new Date().toISOString(),
      assistants: exportedAssistants,
      upstreams: selectedUpstreamsData.map(u => ({
        name: u.name,
        baseUrl: u.baseUrl,
        apiKeys: u.apiKeys,
        remark: u.remark,
        upstreamPlatform: u.upstreamPlatform,
        userApiKey: u.userApiKey,
        aimodels: u.aimodels?.map(m => ({
          category: m.category,
          modelType: m.modelType,
          apiFormat: m.apiFormat,
          modelName: m.modelName,
          name: m.name,
          capabilities: m.capabilities,
          estimatedTime: m.estimatedTime,
          keyName: m.keyName,
        })),
      })),
      conversations: exportedConversations,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mj-studio-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    const parts = []
    if (exportedAssistants.length > 0) parts.push(`${exportedAssistants.length} 个助手`)
    if (exportedConversations.length > 0) parts.push(`${exportedConversations.length} 个对话`)
    if (selectedUpstreamsData.length > 0) parts.push(`${selectedUpstreamsData.length} 个上游配置`)
    toast.add({ title: `已导出 ${parts.join('、')}`, color: 'success' })
  } finally {
    isExporting.value = false
  }
}

// 触发文件选择
function triggerImport() {
  fileInputRef.value?.click()
}

// 处理导入
async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    // 验证格式
    if (!data.version) {
      throw new Error('无效的导入文件格式')
    }

    let assistantCount = 0
    let upstreamCount = 0
    let conversationCount = 0

    // 导入助手
    if (Array.isArray(data.assistants)) {
      for (const item of data.assistants) {
        try {
          // 根据 upstreamName 和 aimodelName 查找匹配的 aimodelId
          let aimodelId: number | undefined
          if (item.upstreamName && item.aimodelName) {
            const upstream = upstreams.value.find(u => u.name === item.upstreamName)
            if (upstream) {
              const aimodel = upstream.aimodels?.find(m => m.name === item.aimodelName)
              if (aimodel) {
                aimodelId = aimodel.id
              }
            }
          }

          // 处理头像：如果是 Base64，保存到本地
          let avatarUrl: string | undefined
          if (item.avatar && item.avatar.startsWith('data:')) {
            avatarUrl = (await base64ToUrl(item.avatar)) || undefined
          } else if (item.avatar) {
            avatarUrl = item.avatar
          }

          await createAssistant({
            name: item.name,
            description: item.description || undefined,
            avatar: avatarUrl,
            systemPrompt: item.systemPrompt || undefined,
            isDefault: false,
            aimodelId,
          })
          assistantCount++
        } catch (e) {
          console.error('导入助手失败:', item.name, e)
        }
      }
    }

    // 导入上游配置
    if (Array.isArray(data.upstreams)) {
      for (const item of data.upstreams) {
        if (!item.name || !item.baseUrl || !item.apiKeys?.length) continue
        const exists = upstreams.value.some(u => u.name === item.name)
        if (exists) continue
        try {
          await createUpstream({
            name: item.name,
            baseUrl: item.baseUrl,
            apiKeys: item.apiKeys,
            aimodels: item.aimodels || [],
            remark: item.remark,
            upstreamPlatform: item.upstreamPlatform,
            userApiKey: item.userApiKey,
          })
          upstreamCount++
        } catch (e) {
          console.error('导入上游配置失败:', item.name, e)
        }
      }
    }

    // 导入对话
    if (Array.isArray(data.conversations)) {
      for (const conv of data.conversations) {
        try {
          // 根据 assistantName 查找助手
          const assistant = assistants.value.find(a => a.name === conv.assistantName)
          if (!assistant) {
            console.warn('找不到匹配的助手:', conv.assistantName)
            continue
          }

          // 创建对话
          const newConv = await $fetch<Conversation>('/api/conversations', {
            method: 'POST',
            body: { assistantId: assistant.id, title: conv.title }
          })

          // 导入消息
          if (Array.isArray(conv.messages)) {
            for (const msg of conv.messages) {
              await $fetch(`/api/conversations/${newConv.id}/messages-manual`, {
                method: 'POST',
                body: {
                  content: msg.content,
                  role: msg.role,
                  modelDisplayName: msg.modelDisplayName || undefined,
                  mark: msg.mark || undefined,
                }
              })
            }
          }
          conversationCount++
        } catch (e) {
          console.error('导入对话失败:', conv.title, e)
        }
      }
    }

    const parts = []
    if (assistantCount > 0) parts.push(`${assistantCount} 个助手`)
    if (conversationCount > 0) parts.push(`${conversationCount} 个对话`)
    if (upstreamCount > 0) parts.push(`${upstreamCount} 个上游配置`)

    if (parts.length > 0) {
      toast.add({ title: `成功导入 ${parts.join('、')}`, color: 'success' })
    } else {
      toast.add({ title: '没有导入任何数据', color: 'warning' })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    toast.add({ title: '导入失败', description: message, color: 'error' })
  }

  target.value = ''
}
</script>

<template>
  <SettingsLayout>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium text-(--ui-text)">导入/导出</h2>
      <div class="flex gap-2">
        <UButton variant="outline" @click="triggerImport">
          <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4 mr-1" />
          导入
        </UButton>
        <UButton :loading="isExporting" @click="handleExport">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          导出选中
        </UButton>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        class="hidden"
        @change="handleImport"
      />
    </div>

    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <div v-else class="space-y-6">
      <!-- 助手区域 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-medium text-(--ui-text)">助手</h3>
          <UButton
            v-if="assistants.length > 0"
            size="xs"
            variant="ghost"
            @click="toggleAllAssistants"
          >
            {{ isAllAssistantsSelected ? '取消全选' : '全选' }}
          </UButton>
        </div>

        <div v-if="assistants.length === 0" class="text-center py-6 text-(--ui-text-muted) text-sm">
          暂无助手，可在对话页面创建
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="assistant in assistants"
            :key="assistant.id"
            class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
            :class="selectedAssistantIds.has(assistant.id)
              ? 'bg-(--ui-primary)/10'
              : 'hover:bg-(--ui-bg)'"
            @click="toggleAssistant(assistant.id)"
          >
            <UCheckbox :model-value="selectedAssistantIds.has(assistant.id)" />
            <div class="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden ring-1 ring-(--ui-border)">
              <img v-if="assistant.avatar" :src="assistant.avatar" class="w-full h-full object-cover" />
              <UIcon v-else name="i-heroicons-user-circle" class="w-full h-full text-(--ui-text-muted)" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ assistant.name }}</div>
              <div class="text-xs text-(--ui-text-dimmed) truncate">{{ assistant.description || '无描述' }}</div>
            </div>
            <UBadge v-if="assistant.isDefault" size="xs" color="primary" variant="soft">默认</UBadge>
          </div>
        </div>
      </div>

      <!-- 对话区域 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-medium text-(--ui-text)">对话</h3>
        </div>

        <!-- 助手选择器 -->
        <div class="mb-4">
          <p class="text-sm text-(--ui-text-muted) mb-2">选择助手以加载其对话：</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="assistant in assistants"
              :key="assistant.id"
              size="xs"
              :variant="selectedAssistantForConv === assistant.id ? 'solid' : 'outline'"
              @click="selectAssistantForConv(assistant.id)"
            >
              {{ assistant.name }}
            </UButton>
          </div>
        </div>

        <!-- 对话列表 -->
        <div v-if="isLoadingConversations" class="text-center py-6">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-(--ui-text-dimmed) animate-spin" />
        </div>

        <div v-else-if="!selectedAssistantForConv" class="text-center py-6 text-(--ui-text-muted) text-sm">
          请先选择一个助手
        </div>

        <div v-else-if="conversationsForExport.length === 0" class="text-center py-6 text-(--ui-text-muted) text-sm">
          该助手暂无对话
        </div>

        <div v-else>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-(--ui-text-muted)">共 {{ conversationsForExport.length }} 个对话</span>
            <UButton size="xs" variant="ghost" @click="toggleAllConversations">
              {{ isAllConversationsSelected ? '取消全选' : '全选' }}
            </UButton>
          </div>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="conv in conversationsForExport"
              :key="conv.id"
              class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
              :class="selectedConversationIds.has(conv.id)
                ? 'bg-(--ui-primary)/10'
                : 'hover:bg-(--ui-bg)'"
              @click="toggleConversation(conv.id)"
            >
              <UCheckbox :model-value="selectedConversationIds.has(conv.id)" />
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-(--ui-text-muted)" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ conv.title }}</div>
                <div class="text-xs text-(--ui-text-dimmed)">{{ new Date(conv.createdAt).toLocaleString() }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 上游配置区域 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-4 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-medium text-(--ui-text)">上游配置</h3>
          <UButton
            v-if="upstreams.length > 0"
            size="xs"
            variant="ghost"
            @click="toggleAllUpstreams"
          >
            {{ isAllUpstreamsSelected ? '取消全选' : '全选' }}
          </UButton>
        </div>

        <div v-if="upstreams.length === 0" class="text-center py-6 text-(--ui-text-muted) text-sm">
          暂无上游配置
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="upstream in upstreams"
            :key="upstream.id"
            class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
            :class="selectedUpstreamIds.has(upstream.id)
              ? 'bg-(--ui-primary)/10'
              : 'hover:bg-(--ui-bg)'"
            @click="toggleUpstream(upstream.id)"
          >
            <UCheckbox :model-value="selectedUpstreamIds.has(upstream.id)" />
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-(--ui-text-muted)" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ upstream.name }}</div>
              <div class="text-xs text-(--ui-text-dimmed) truncate">{{ upstream.baseUrl }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="mt-6 p-4 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
      <h3 class="text-sm font-medium text-(--ui-text) mb-2">说明</h3>
      <ul class="text-xs text-(--ui-text-muted) space-y-1">
        <li>选择要导出的项目后点击"导出选中"</li>
        <li>助手导出包含名称、描述、头像（自动转换为 Base64）和系统提示词</li>
        <li>对话导出包含标题和所有消息内容</li>
        <li>上游配置导出包含名称、API 地址、密钥和模型列表</li>
        <li>导入时会创建新项目，同名上游配置会跳过</li>
        <li>导入对话时需先导入对应的助手</li>
      </ul>
    </div>
  </SettingsLayout>
</template>

<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'
import type { Upstream, AimodelInput } from '~/composables/useUpstreams'

const { assistants, isLoading: isLoadingAssistants, createAssistant } = useAssistants()
const { upstreams, createUpstream } = useUpstreams()
const toast = useToast()

// 加载状态
const isLoading = ref(true)

// 导入文件输入
const fileInputRef = ref<HTMLInputElement | null>(null)

// 选中状态
const selectedAssistantIds = ref<Set<number>>(new Set())
const selectedUpstreamIds = ref<Set<number>>(new Set())

// 加载数据
onMounted(async () => {
  // 数据已由插件加载，等待加载完成即可
  while (isLoadingAssistants.value) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  isLoading.value = false
})

// 助手选择
const isAllAssistantsSelected = computed(() =>
  assistants.value.length > 0 && selectedAssistantIds.value.size === assistants.value.length
)
const isSomeAssistantsSelected = computed(() =>
  selectedAssistantIds.value.size > 0 && selectedAssistantIds.value.size < assistants.value.length
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
const isSomeUpstreamsSelected = computed(() =>
  selectedUpstreamIds.value.size > 0 && selectedUpstreamIds.value.size < upstreams.value.length
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

// 导出选中项
function handleExport() {
  const selectedAssistants = assistants.value.filter(a => selectedAssistantIds.value.has(a.id))
  const selectedUpstreamsData = upstreams.value.filter(u => selectedUpstreamIds.value.has(u.id))

  if (selectedAssistants.length === 0 && selectedUpstreamsData.length === 0) {
    toast.add({ title: '请先选择要导出的项目', color: 'warning' })
    return
  }

  const exportData = {
    version: 2, // 版本号升级，以区分新格式
    exportedAt: new Date().toISOString(),
    assistants: selectedAssistants.map(a => ({
      name: a.name,
      description: a.description,
      avatar: a.avatar,
      systemPrompt: a.systemPrompt,
      isDefault: a.isDefault,
    })),
    upstreams: selectedUpstreamsData.map(u => ({
      name: u.name,
      baseUrl: u.baseUrl,
      apiKey: u.apiKey,
      apiKeys: u.apiKeys,
      remark: u.remark,
      isDefault: u.isDefault,
      upstreamPlatform: u.upstreamPlatform,
      userApiKey: u.userApiKey,
      aimodels: u.aimodels?.map(m => ({
        category: m.category,
        modelType: m.modelType,
        apiFormat: m.apiFormat,
        modelName: m.modelName,
        estimatedTime: m.estimatedTime,
        keyName: m.keyName,
      })),
    })),
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mj-studio-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)

  const parts = []
  if (selectedAssistants.length > 0) parts.push(`${selectedAssistants.length} 个助手`)
  if (selectedUpstreamsData.length > 0) parts.push(`${selectedUpstreamsData.length} 个上游配置`)
  toast.add({ title: `已导出 ${parts.join('、')}`, color: 'success' })
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

    // 导入助手
    if (Array.isArray(data.assistants)) {
      for (const item of data.assistants) {
        try {
          await createAssistant({
            name: item.name,
            description: item.description || undefined,
            avatar: item.avatar || undefined,
            systemPrompt: item.systemPrompt || undefined,
            isDefault: false,
          })
          assistantCount++
        } catch (e) {
          console.error('导入助手失败:', item.name, e)
        }
      }
    }

    // 导入上游配置（新格式 v2）
    if (Array.isArray(data.upstreams)) {
      for (const item of data.upstreams) {
        if (!item.name || !item.baseUrl || !item.apiKey) continue
        const exists = upstreams.value.some(u => u.name === item.name)
        if (exists) continue
        try {
          await createUpstream({
            name: item.name,
            baseUrl: item.baseUrl,
            apiKey: item.apiKey,
            apiKeys: item.apiKeys,
            aimodels: item.aimodels || [],
            remark: item.remark,
            isDefault: false,
            upstreamPlatform: item.upstreamPlatform,
            userApiKey: item.userApiKey,
          })
          upstreamCount++
        } catch (e) {
          console.error('导入上游配置失败:', item.name, e)
        }
      }
    }

    // 兼容旧格式（v1 modelConfigs）
    if (Array.isArray(data.modelConfigs)) {
      for (const item of data.modelConfigs) {
        if (!item.name || !item.baseUrl || !item.apiKey) continue
        const exists = upstreams.value.some(u => u.name === item.name)
        if (exists) continue
        try {
          // 转换旧格式的 modelTypeConfigs 为新格式的 aimodels
          const aimodels: AimodelInput[] = (item.modelTypeConfigs || []).map((mtc: any) => ({
            category: mtc.category || 'image',
            modelType: mtc.modelType,
            apiFormat: mtc.apiFormat,
            modelName: mtc.modelName,
            estimatedTime: mtc.estimatedTime,
            keyName: mtc.keyName,
          }))
          await createUpstream({
            name: item.name,
            baseUrl: item.baseUrl,
            apiKey: item.apiKey,
            aimodels,
            remark: item.remark,
            isDefault: false,
          })
          upstreamCount++
        } catch (e) {
          console.error('导入模型配置失败:', item.name, e)
        }
      }
    }

    const parts = []
    if (assistantCount > 0) parts.push(`${assistantCount} 个助手`)
    if (upstreamCount > 0) parts.push(`${upstreamCount} 个上游配置`)

    if (parts.length > 0) {
      toast.add({ title: `成功导入 ${parts.join('、')}`, color: 'success' })
    } else {
      toast.add({ title: '没有导入任何数据', color: 'warning' })
    }
  } catch (error: any) {
    toast.add({ title: '导入失败', description: error.message, color: 'error' })
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
        <UButton @click="handleExport">
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
            <UBadge v-if="upstream.isDefault" size="xs" color="primary" variant="soft">默认</UBadge>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示信息 -->
    <div class="mt-6 p-4 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
      <h3 class="text-sm font-medium text-(--ui-text) mb-2">说明</h3>
      <ul class="text-xs text-(--ui-text-muted) space-y-1">
        <li>• 选择要导出的项目后点击"导出选中"</li>
        <li>• 助手导出包含名称、描述、头像（Base64）和系统提示词</li>
        <li>• 上游配置导出包含名称、API 地址、密钥和模型列表</li>
        <li>• 导入时会创建新项目，同名上游配置会跳过</li>
        <li>• 支持导入旧版本（v1）的配置文件</li>
      </ul>
    </div>
  </SettingsLayout>
</template>

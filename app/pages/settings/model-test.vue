<script setup lang="ts">
import type { ModelCategory } from '~/shared/types'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()

// ==================== 状态 ====================

// 配置
const category = ref<ModelCategory>('chat')
const prompt = ref('请用一句话介绍你自己')
const keywordsInput = ref('')
const concurrency = ref(3)
const timeout = ref(30)

// 测试状态
const isRunning = ref(false)
const currentRecordId = ref<number | null>(null)
const abortController = ref<AbortController | null>(null)
const models = ref<Array<{
  aimodelId: number
  upstreamId: number
  upstreamName: string
  modelName: string
  name: string
  modelType: string
}>>([])

// 模型状态 Map
const modelStatuses = ref(new Map<number, {
  status: 'untested' | 'waiting' | 'testing' | 'success' | 'failed'
  responseTime?: number
  responsePreview?: string
  errorMessage?: string
}>())

// 选择状态
const selectedIds = ref(new Set<number>())

// 历史记录
const records = ref<Array<{
  id: number
  category: string
  totalCount: number
  successCount: number
  failedCount: number
  createdAt: string
}>>([])

// 筛选
const filterStatus = ref<'all' | 'success' | 'failed'>('all')

// 删除确认对话框
const showDeleteConfirm = ref(false)

// 测试配置筛选
const configFilterKeyword = ref('')

// 筛选后的待测试模型
const filteredModels = computed(() => {
  if (!configFilterKeyword.value.trim()) {
    return models.value
  }
  const kw = configFilterKeyword.value.toLowerCase()
  return models.value.filter(m =>
    m.upstreamName.toLowerCase().includes(kw)
    || m.name.toLowerCase().includes(kw)
    || m.modelName.toLowerCase().includes(kw)
  )
})

// 加载状态
const isLoading = ref(false)

// 下拉选项
const categoryOptions = [
  { label: '对话', value: 'chat' },
  { label: '绘图', value: 'image' },
  { label: '视频', value: 'video' },
]

const concurrencyOptions = [1, 2, 3, 5, 10].map(n => ({ label: String(n), value: n }))

// ==================== 计算属性 ====================

const defaultPrompts: Record<ModelCategory, string> = {
  chat: '请用一句话介绍你自己',
  image: 'a cute cat, simple illustration',
  video: 'a cat walking slowly',
}

const defaultTimeouts: Record<ModelCategory, number> = {
  chat: 30,
  image: 120,
  video: 300,
}

const keywords = computed(() => {
  return keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean)
})

const totalCount = computed(() => filteredModels.value.length)

const completedCount = computed(() => {
  let count = 0
  modelStatuses.value.forEach(s => {
    if (s.status === 'success' || s.status === 'failed') count++
  })
  return count
})

const successCount = computed(() => {
  let count = 0
  modelStatuses.value.forEach(s => {
    if (s.status === 'success') count++
  })
  return count
})

const failedCount = computed(() => {
  let count = 0
  modelStatuses.value.forEach(s => {
    if (s.status === 'failed') count++
  })
  return count
})

const testingCount = computed(() => {
  let count = 0
  modelStatuses.value.forEach(s => {
    if (s.status === 'testing') count++
  })
  return count
})

// 按上游分组（用于显示）
const groupedModels = computed(() => {
  let filtered = filteredModels.value

  // 状态筛选
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(m => {
      const s = modelStatuses.value.get(m.aimodelId)
      return s?.status === filterStatus.value
    })
  }

  const groups = new Map<string, typeof models.value>()
  filtered.forEach(m => {
    if (!groups.has(m.upstreamName)) {
      groups.set(m.upstreamName, [])
    }
    groups.get(m.upstreamName)!.push(m)
  })
  return groups
})

// ==================== 方法 ====================

// 切换分类
watch(category, (val) => {
  prompt.value = defaultPrompts[val]
  timeout.value = defaultTimeouts[val]
  loadModels()
})

// 加载模型列表
async function loadModels() {
  isLoading.value = true
  try {
    const result = await $fetch<{
      models: typeof models.value
    }>('/api/model-test/models', {
      query: { category: category.value },
    })
    models.value = result.models
    // 初始化状态
    const newStatuses = new Map<number, typeof modelStatuses.value extends Map<number, infer V> ? V : never>()
    result.models.forEach(m => {
      newStatuses.set(m.aimodelId, { status: 'untested' })
    })
    modelStatuses.value = newStatuses
    selectedIds.value = new Set()
  } catch (error: any) {
    toast.add({
      title: '加载模型失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// 开始测试
async function startTest() {
  if (isRunning.value) return
  if (filteredModels.value.length === 0) {
    toast.add({ title: '没有可测试的模型', color: 'warning' })
    return
  }

  try {
    const result = await $fetch<{
      recordId: number
    }>('/api/model-test/start', {
      method: 'POST',
      body: {
        category: category.value,
        prompt: prompt.value,
        keywords: keywords.value.length > 0 ? keywords.value : undefined,
      },
    })

    currentRecordId.value = result.recordId

    // 重置筛选后模型的状态为 untested
    filteredModels.value.forEach(m => {
      modelStatuses.value.set(m.aimodelId, { status: 'untested' })
    })
    selectedIds.value = new Set()

    // 开始测试筛选后的模型
    isRunning.value = true
    await runTestQueue(filteredModels.value)
  } catch (error: any) {
    toast.add({
      title: '开始测试失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isRunning.value = false
    loadRecords()
  }
}

// 停止测试
function stopTest() {
  isRunning.value = false
  abortController.value?.abort()
  abortController.value = null
}

// 并发测试队列
async function runTestQueue(testModels: typeof models.value) {
  const queue = [...testModels]
  abortController.value = new AbortController()
  const signal = abortController.value.signal

  // 标记等待中
  queue.forEach(m => {
    modelStatuses.value.set(m.aimodelId, { status: 'waiting' })
  })

  async function runNext(): Promise<void> {
    if (!isRunning.value || queue.length === 0 || signal.aborted) return

    const model = queue.shift()
    if (!model) return

    modelStatuses.value.set(model.aimodelId, { status: 'testing' })

    try {
      const result = await $fetch<{
        aimodelId: number
        status: 'success' | 'failed'
        responseTime: number
        responsePreview?: string
        errorMessage?: string
      }>('/api/model-test/execute', {
        method: 'POST',
        body: {
          recordId: currentRecordId.value,
          aimodelId: model.aimodelId,
          prompt: prompt.value,
          keywords: keywords.value.length > 0 ? keywords.value : undefined,
          timeout: timeout.value,
        },
        signal,
      })

      modelStatuses.value.set(model.aimodelId, {
        status: result.status,
        responseTime: result.responseTime,
        responsePreview: result.responsePreview,
        errorMessage: result.errorMessage,
      })
    } catch (error: any) {
      // 被取消时不更新状态为失败，保持 waiting/testing
      if (error.name === 'AbortError' || signal.aborted) {
        modelStatuses.value.set(model.aimodelId, { status: 'untested' })
        return
      }
      modelStatuses.value.set(model.aimodelId, {
        status: 'failed',
        errorMessage: error.message || '请求失败',
      })
    }

    await runNext()
  }

  const promises: Promise<void>[] = []
  for (let i = 0; i < concurrency.value && i < queue.length; i++) {
    promises.push(runNext())
  }
  await Promise.all(promises)
}

// 切换选择
function toggleSelect(aimodelId: number) {
  if (selectedIds.value.has(aimodelId)) {
    selectedIds.value.delete(aimodelId)
  } else {
    selectedIds.value.add(aimodelId)
  }
}

// 全选
function toggleSelectAll() {
  const filtered = filterStatus.value === 'all'
    ? models.value
    : models.value.filter(m => modelStatuses.value.get(m.aimodelId)?.status === filterStatus.value)

  if (selectedIds.value.size === filtered.length) {
    selectedIds.value.clear()
  } else {
    filtered.forEach(m => selectedIds.value.add(m.aimodelId))
  }
}

// 选择失败的
function selectFailed() {
  selectedIds.value.clear()
  models.value.forEach(m => {
    if (modelStatuses.value.get(m.aimodelId)?.status === 'failed') {
      selectedIds.value.add(m.aimodelId)
    }
  })
}

// 重试选中
async function retrySelected() {
  const failedIds = Array.from(selectedIds.value).filter(id => {
    return modelStatuses.value.get(id)?.status === 'failed'
  })
  if (failedIds.length === 0) {
    toast.add({ title: '没有可重试的失败模型', color: 'warning' })
    return
  }

  const toRetry = models.value.filter(m => failedIds.includes(m.aimodelId))
  isRunning.value = true
  await runTestQueue(toRetry)
  isRunning.value = false
}

// 批量删除 - 显示确认对话框
function batchDelete() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

// 批量删除 - 确认执行
async function confirmBatchDelete() {
  showDeleteConfirm.value = false

  try {
    await $fetch('/api/model-test/batch', {
      method: 'POST',
      body: {
        action: 'delete',
        aimodelIds: Array.from(selectedIds.value),
      },
    })

    // 从列表移除
    const ids = Array.from(selectedIds.value)
    models.value = models.value.filter(m => !ids.includes(m.aimodelId))
    ids.forEach(id => {
      modelStatuses.value.delete(id)
      selectedIds.value.delete(id)
    })

    toast.add({ title: '删除成功', color: 'success' })
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error.message, color: 'error' })
  }
}

// 加载历史记录
async function loadRecords() {
  try {
    const result = await $fetch<{
      records: typeof records.value
      total: number
    }>('/api/model-test/records', {
      query: { limit: 10 },
    })
    records.value = result.records
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
}

// 状态图标和颜色
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    untested: 'i-heroicons-minus-circle',
    waiting: 'i-heroicons-clock',
    testing: 'i-heroicons-arrow-path',
    success: 'i-heroicons-check-circle',
    failed: 'i-heroicons-x-circle',
  }
  return icons[status] || 'i-heroicons-question-mark-circle'
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    untested: 'text-(--ui-text-muted)',
    waiting: 'text-yellow-500',
    testing: 'text-blue-500 animate-spin',
    success: 'text-green-500',
    failed: 'text-red-500',
  }
  return classes[status] || 'text-(--ui-text-muted)'
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    chat: '对话',
    image: '绘图',
    video: '视频',
  }
  return labels[cat] || cat
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadModels()
  loadRecords()
})
</script>

<template>
  <SettingsLayout>
    <!-- 页面标题 -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-(--ui-text)">模型可用性测试</h1>
        <p class="text-(--ui-text-muted) text-sm mt-1">批量测试所有上游模型的可用性，快速识别失效模型</p>
      </div>
      <div class="flex gap-2">
        <UButton
          v-if="isRunning"
          color="error"
          variant="outline"
          icon="i-heroicons-stop"
          @click="stopTest"
        >
          停止测试
        </UButton>
        <UButton
          v-else
          icon="i-heroicons-play"
          @click="startTest"
        >
          开始测试
        </UButton>
      </div>
    </div>

    <div class="space-y-6">
      <!-- 测试配置 -->
      <div class="max-w-2xl bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-4">
        <h2 class="text-lg font-medium text-(--ui-text) mb-4">测试配置</h2>

        <div class="grid grid-cols-4 gap-4">
          <UFormField label="模型分类">
            <USelectMenu
              v-model="category"
              :items="categoryOptions"
              value-key="value"
              :disabled="isRunning"
            />
          </UFormField>

          <UFormField label="筛选模型">
            <UInput
              v-model="configFilterKeyword"
              placeholder="上游/模型名称"
              :disabled="isRunning"
            />
          </UFormField>

          <UFormField label="并发数">
            <USelectMenu
              v-model="concurrency"
              :items="concurrencyOptions"
              value-key="value"
              :disabled="isRunning"
            />
          </UFormField>

          <UFormField label="超时时间 (秒)">
            <UInput
              v-model.number="timeout"
              type="number"
              min="10"
              max="600"
              :disabled="isRunning"
            />
          </UFormField>
        </div>

        <UFormField label="测试提示词">
          <UTextarea
            v-model="prompt"
            :rows="2"
            placeholder="输入测试提示词..."
            :disabled="isRunning"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="category === 'chat'" label="验证关键词">
          <template #hint>
            <span>可选，逗号分隔</span>
          </template>
          <UInput
            v-model="keywordsInput"
            placeholder="AI, 助手, 模型"
            :disabled="isRunning"
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- 测试结果 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
        <!-- 进度 -->
        <div v-if="isRunning || completedCount > 0" class="p-4 border-b border-(--ui-border)">
          <div class="flex items-center justify-between mb-2 text-sm">
            <span class="text-(--ui-text-muted)">
              测试进度: {{ completedCount }}/{{ totalCount }}
              <span v-if="testingCount > 0" class="text-blue-500 ml-2">(并发中: {{ testingCount }})</span>
            </span>
            <span>
              <span class="text-green-500">成功 {{ successCount }}</span>
              <span class="mx-2 text-(--ui-text-muted)">/</span>
              <span class="text-red-500">失败 {{ failedCount }}</span>
            </span>
          </div>
          <UProgress :model-value="completedCount" :max="totalCount" />
        </div>

        <!-- 筛选和操作 -->
        <div class="p-4 border-b border-(--ui-border) flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1">
            <UButton
              size="xs"
              :variant="filterStatus === 'all' ? 'solid' : 'ghost'"
              @click="filterStatus = 'all'"
            >
              全部 {{ totalCount }}
            </UButton>
            <UButton
              size="xs"
              :variant="filterStatus === 'success' ? 'solid' : 'ghost'"
              color="success"
              @click="filterStatus = 'success'"
            >
              成功 {{ successCount }}
            </UButton>
            <UButton
              size="xs"
              :variant="filterStatus === 'failed' ? 'solid' : 'ghost'"
              color="error"
              @click="filterStatus = 'failed'"
            >
              失败 {{ failedCount }}
            </UButton>
          </div>

          <div class="flex-1" />

          <div class="flex items-center gap-1">
            <UButton size="xs" variant="ghost" @click="toggleSelectAll">
              全选
            </UButton>
            <UButton size="xs" variant="ghost" @click="selectFailed">
              选择失败
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              :disabled="selectedIds.size === 0 || isRunning"
              @click="retrySelected"
            >
              批量重试
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              :disabled="selectedIds.size === 0"
              @click="batchDelete"
            >
              批量删除
            </UButton>
          </div>
        </div>

        <!-- 模型列表 -->
        <div>
          <div v-if="isLoading" class="text-center py-12 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto mb-3 animate-spin" />
            <p>加载中...</p>
          </div>

          <div v-else-if="models.length === 0" class="text-center py-12 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-cube" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无模型</p>
            <p class="text-sm mt-1">请先在上游配置中添加模型</p>
          </div>

          <template v-else>
            <template v-for="[upstreamName, upstreamModels] in groupedModels" :key="upstreamName">
              <div class="px-4 py-2 text-sm font-medium text-(--ui-text-muted)">
                {{ upstreamName }}
              </div>
              <div
                v-for="model in upstreamModels"
                :key="model.aimodelId"
                class="flex items-center gap-3 mx-2 my-1 p-2 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 transition-colors"
              >
                <UCheckbox
                  :model-value="selectedIds.has(model.aimodelId)"
                  @update:model-value="toggleSelect(model.aimodelId)"
                />
                <UIcon
                  :name="getStatusIcon(modelStatuses.get(model.aimodelId)?.status || 'untested')"
                  :class="['w-5 h-5', getStatusClass(modelStatuses.get(model.aimodelId)?.status || 'untested')]"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-(--ui-text) truncate">{{ model.name }}</div>
                  <div class="text-xs text-(--ui-text-dimmed)">{{ model.modelType }}</div>
                </div>
                <div class="text-right text-xs shrink-0">
                  <template v-if="modelStatuses.get(model.aimodelId)?.status === 'success'">
                    <div class="text-green-500">{{ ((modelStatuses.get(model.aimodelId)?.responseTime || 0) / 1000).toFixed(1) }}s</div>
                    <div class="text-(--ui-text-muted) truncate max-w-48">
                      {{ modelStatuses.get(model.aimodelId)?.responsePreview?.slice(0, 50) }}
                    </div>
                  </template>
                  <template v-else-if="modelStatuses.get(model.aimodelId)?.status === 'failed'">
                    <div class="text-red-500 truncate max-w-48">
                      {{ modelStatuses.get(model.aimodelId)?.errorMessage }}
                    </div>
                  </template>
                  <template v-else-if="modelStatuses.get(model.aimodelId)?.status === 'testing'">
                    <div class="text-blue-500">测试中...</div>
                  </template>
                  <template v-else-if="modelStatuses.get(model.aimodelId)?.status === 'waiting'">
                    <div class="text-yellow-500">等待中</div>
                  </template>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <!-- 历史记录 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
        <div class="p-4 border-b border-(--ui-border) flex items-center justify-between">
          <h2 class="text-lg font-medium text-(--ui-text)">历史记录</h2>
          <UButton size="xs" variant="ghost" icon="i-heroicons-arrow-path" @click="loadRecords" />
        </div>

        <div class="max-h-64 overflow-y-auto">
          <div v-if="records.length === 0" class="text-center py-8 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-clock" class="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">暂无测试记录</p>
          </div>

          <div
            v-for="record in records"
            :key="record.id"
            class="flex items-center justify-between mx-2 my-1 p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 transition-colors"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm text-(--ui-text)">{{ formatTime(record.createdAt) }}</span>
              <UBadge size="xs" variant="subtle">{{ getCategoryLabel(record.category) }}</UBadge>
            </div>
            <div class="text-xs">
              <span class="text-green-500">成功 {{ record.successCount }}</span>
              <span class="mx-1 text-(--ui-text-muted)">/</span>
              <span class="text-red-500">失败 {{ record.failedCount }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" :description="`确定要删除选中的 ${selectedIds.size} 个模型吗？此操作不可撤销。`" :close="false">
      <template #footer>
        <UButton variant="ghost" @click="showDeleteConfirm = false">取消</UButton>
        <UButton color="error" @click="confirmBatchDelete">删除</UButton>
      </template>
    </UModal>
  </SettingsLayout>
</template>

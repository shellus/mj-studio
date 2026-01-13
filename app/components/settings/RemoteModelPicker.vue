<script setup lang="ts">
import type { ModelCategory, ModelCapability, ApiFormat, ModelType } from '../../shared/types'
import type { AimodelInput } from '../../composables/useUpstreams'
import { getModelGroup } from '../../shared/model-inference'
import { getModelLogoById } from '../../shared/model-logo'

interface RemoteModel {
  id: string
  name: string
  group: string
  category: ModelCategory
  capabilities: ModelCapability[]
  apiFormat: ApiFormat
  modelType: ModelType
}

const props = defineProps<{
  baseUrl: string
  apiKey: string
}>()

const emit = defineEmits<{
  import: [models: AimodelInput[]]
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

// 状态
const loading = ref(false)
const searchQuery = ref('')
const categoryFilter = ref<ModelCategory | 'all'>('all')
const groupFilter = ref<string>('all')
const remoteModels = ref<RemoteModel[]>([])
const selectedIds = ref<Set<string>>(new Set())

// 分类选项
const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '对话', value: 'chat' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
]

// 分组选项（动态生成）
const groupOptions = computed(() => {
  const groups = new Set<string>()
  for (const model of remoteModels.value) {
    groups.add(model.group)
  }
  return [
    { label: '全部厂商', value: 'all' },
    ...Array.from(groups).sort().map(g => ({ label: g, value: g })),
  ]
})

// 能力配置（图标 + 颜色）
const capabilityConfig: Record<ModelCapability, { icon: string; color: string }> = {
  vision: { icon: 'i-heroicons-eye', color: 'text-green-500' },
  reasoning: { icon: 'i-heroicons-light-bulb', color: 'text-purple-500' },
  function_calling: { icon: 'i-heroicons-wrench', color: 'text-amber-500' },
  web_search: { icon: 'i-heroicons-globe-alt', color: 'text-blue-500' },
}

// 分类标签
const categoryLabels: Record<ModelCategory, string> = {
  chat: '对话',
  image: '图片',
  video: '视频',
}

// 获取远程模型列表
async function fetchModels() {
  if (!props.baseUrl || !props.apiKey) {
    toast.add({ title: '请先填写 API 地址和密钥', color: 'warning' })
    return
  }

  loading.value = true
  try {
    const data = await $fetch<{ models: RemoteModel[] }>('/api/remote-models', {
      method: 'POST',
      body: { baseUrl: props.baseUrl, apiKey: props.apiKey },
    })
    remoteModels.value = data.models
    selectedIds.value.clear()
  } catch (err: any) {
    toast.add({
      title: '获取模型列表失败',
      description: err.data?.message || err.message,
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

// 过滤后的模型列表
const filteredModels = computed(() => {
  let models = remoteModels.value

  // 分类筛选
  if (categoryFilter.value !== 'all') {
    models = models.filter(m => m.category === categoryFilter.value)
  }

  // 分组筛选
  if (groupFilter.value !== 'all') {
    models = models.filter(m => m.group === groupFilter.value)
  }

  // 搜索筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    models = models.filter(m => m.id.toLowerCase().includes(query))
  }

  return models
})

// 按 group 分组
const groupedModels = computed(() => {
  const groups: Record<string, RemoteModel[]> = {}
  for (const model of filteredModels.value) {
    if (!groups[model.group]) {
      groups[model.group] = []
    }
    groups[model.group]!.push(model)
  }
  return groups
})

// 切换选择
function toggleSelect(modelId: string) {
  if (selectedIds.value.has(modelId)) {
    selectedIds.value.delete(modelId)
  } else {
    selectedIds.value.add(modelId)
  }
  // 触发响应式更新
  selectedIds.value = new Set(selectedIds.value)
}

// 导入选中的模型
function importSelected() {
  const models: AimodelInput[] = []
  for (const id of selectedIds.value) {
    const model = remoteModels.value.find(m => m.id === id)
    if (model) {
      models.push({
        category: model.category,
        modelType: model.modelType,
        apiFormat: model.apiFormat,
        modelName: model.id,
        name: model.id,
        capabilities: model.capabilities,
        estimatedTime: model.category === 'video' ? 120 : model.category === 'image' ? 60 : 5,
      })
    }
  }
  emit('import', models)
  open.value = false
}

// 打开时自动获取
watch(open, (isOpen) => {
  if (isOpen && remoteModels.value.length === 0) {
    fetchModels()
  }
})
</script>

<template>
  <UModal v-model:open="open" title="从上游导入模型" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="space-y-4">
        <!-- 搜索和筛选 -->
        <div class="flex items-center gap-3">
          <UInput
            v-model="searchQuery"
            placeholder="搜索模型..."
            icon="i-heroicons-magnifying-glass"
            class="flex-1"
          />
          <USelectMenu
            v-model="groupFilter"
            :items="groupOptions"
            value-key="value"
            class="w-32"
          />
          <USelectMenu
            v-model="categoryFilter"
            :items="categoryOptions"
            value-key="value"
            class="w-24"
          />
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-(--ui-text-muted)" />
          <span class="ml-2 text-(--ui-text-muted)">加载中...</span>
        </div>

        <!-- 模型列表占位 -->
        <div v-else-if="remoteModels.length === 0" class="text-center py-12 text-(--ui-text-muted)">
          <UButton @click="fetchModels">获取模型列表</UButton>
        </div>

        <!-- 模型列表 -->
        <div v-else class="max-h-96 overflow-y-auto space-y-4">
          <div v-for="(models, group) in groupedModels" :key="group">
            <div class="text-xs font-medium text-(--ui-text-muted) mb-2 sticky top-0 bg-(--ui-bg) py-1">
              {{ group }}
            </div>
            <div class="space-y-1">
              <div
                v-for="model in models"
                :key="model.id"
                class="flex items-center gap-3 p-2 rounded-lg hover:bg-(--ui-bg-muted) cursor-pointer"
                :class="{ 'bg-(--ui-primary)/10': selectedIds.has(model.id) }"
                @click="toggleSelect(model.id)"
              >
                <UCheckbox :model-value="selectedIds.has(model.id)" />
                <!-- 模型图标 -->
                <img
                  v-if="getModelLogoById(model.id)"
                  :src="getModelLogoById(model.id)"
                  class="w-5 h-5 rounded shrink-0 object-contain"
                  :alt="model.id"
                />
                <div
                  v-else
                  class="w-5 h-5 rounded shrink-0 bg-(--ui-bg-accented) flex items-center justify-center text-xs font-medium text-(--ui-text-muted)"
                >
                  {{ model.id[0]?.toUpperCase() }}
                </div>
                <span class="flex-1 text-sm truncate">{{ model.id }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded bg-(--ui-bg-accented) text-(--ui-text-muted)">
                  {{ categoryLabels[model.category] }}
                </span>
                <div class="flex gap-1.5">
                  <UIcon
                    v-for="cap in model.capabilities"
                    :key="cap"
                    :name="capabilityConfig[cap].icon"
                    class="w-4 h-4"
                    :class="capabilityConfig[cap].color"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="flex items-center justify-between pt-4 border-t border-(--ui-border)">
          <span class="text-sm text-(--ui-text-muted)">
            已选择 {{ selectedIds.size }} 个模型
          </span>
          <div class="flex gap-3">
            <UButton variant="outline" color="neutral" @click="open = false">取消</UButton>
            <UButton :disabled="selectedIds.size === 0" @click="importSelected">导入</UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

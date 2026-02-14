<script setup lang="ts">
import type { Upstream } from '~/composables/useUpstreams'
import type { AvailableUpstream, AvailableAimodel } from '~/composables/useAvailableUpstreams'
import type { ModelCategory } from '~/shared/types'
import { MODEL_TYPE_ICONS } from '~/shared/constants'

// 基础模型类型（Aimodel 和 AvailableAimodel 的共同字段）
type BaseAimodel = {
  id: number
  category: ModelCategory
  modelType: string
  apiFormat?: string
  name: string
}

const props = defineProps<{
  upstreams: (Upstream | AvailableUpstream)[]
  category: ModelCategory
  aimodelId?: number | null
  // 只读模式（用于查看，不可选择）
  readOnly?: boolean
  // 下拉面板宽度，默认 w-80 (320px)
  dropdownWidth?: string
  // 使用列表布局而非 grid 布局
  listLayout?: boolean
  // 禁用自动选择默认配置
  noAutoSelect?: boolean
  // 下拉框右对齐（向左展开）
  alignRight?: boolean
  // 紧凑模式（无边框，更小尺寸，适合工具栏）
  compact?: boolean
  // 移动端隐藏文字（仅显示图标）
  hideTextOnMobile?: boolean
}>()

const emit = defineEmits<{
  'update:aimodelId': [id: number | null]
}>()

const router = useRouter()

// 模态框状态
const isModalOpen = ref(false)

// 从 aimodelId 计算 upstreamId
const computedUpstreamId = computed(() => {
  if (!props.aimodelId) return null

  for (const upstream of props.upstreams) {
    if (upstream.aimodels?.some(m => m.id === props.aimodelId)) {
      return upstream.id
    }
  }
  return null
})

// 内部状态
const selectedUpstreamId = ref<number | null>(computedUpstreamId.value)
const selectedAimodelId = ref<number | null>(props.aimodelId ?? null)

// 同步 props 到内部状态
watch(() => props.aimodelId, (val) => {
  selectedAimodelId.value = val ?? null
  selectedUpstreamId.value = computedUpstreamId.value
})

// 搜索关键词
const searchQuery = ref('')

// 上游筛选
const upstreamFilter = ref<number | 'all'>('all')

// 上游选项
const upstreamOptions = computed(() => {
  return [
    { label: '全部上游', value: 'all' as const },
    ...groupedModels.value.map(g => ({
      label: g.upstreamName,
      value: g.upstreamId
    }))
  ]
})

// 过滤后的分组模型
const filteredGroupedModels = computed(() => {
  let groups = groupedModels.value

  // 上游筛选
  if (upstreamFilter.value !== 'all') {
    groups = groups.filter(g => g.upstreamId === upstreamFilter.value)
  }

  // 搜索筛选
  if (!searchQuery.value.trim()) {
    return groups
  }

  const query = searchQuery.value.toLowerCase()
  return groups
    .map(group => ({
      ...group,
      aimodels: group.aimodels.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.modelType.toLowerCase().includes(query)
      )
    }))
    .filter(group => group.aimodels.length > 0)
})

// 打开模态框
function openModal() {
  if (props.readOnly || !hasModels.value) return
  searchQuery.value = ''
  upstreamFilter.value = 'all'
  isModalOpen.value = true

  // 等待模态框渲染后滚动到当前选中的模型
  nextTick(() => {
    if (selectedAimodelId.value) {
      const selectedButton = document.querySelector(`[data-aimodel-id="${selectedAimodelId.value}"]`)
      if (selectedButton) {
        selectedButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  })
}

// 检查模型是否选中
function isSelected(upstreamId: number, aimodelId: number): boolean {
  return selectedUpstreamId.value === upstreamId && selectedAimodelId.value === aimodelId
}

// 选择模型（点击直接确认）
function handleSelectModel(upstreamId: number, aimodelId: number) {
  selectedUpstreamId.value = upstreamId
  selectedAimodelId.value = aimodelId
  emit('update:aimodelId', aimodelId)
  isModalOpen.value = false
}

// 重置筛选
function resetFilters() {
  searchQuery.value = ''
  upstreamFilter.value = 'all'
}

// 判断是否是绘图模型类型
function isImageModelType(modelType: string): boolean {
  const imageModels = [
    'midjourney', 'gemini', 'flux', 'dalle', 'doubao',
    'gpt4o-image', 'grok-image', 'qwen-image', 'z-image'
  ]
  return imageModels.includes(modelType)
}

// 过滤出当前分类的模型
function filterModelsByCategory(aimodels: BaseAimodel[]): BaseAimodel[] {
  return aimodels.filter(m => {
    if (props.category === 'image') {
      return m.category === 'image' || (!m.category && isImageModelType(m.modelType))
    } else if (props.category === 'video') {
      return m.category === 'video'
    } else {
      return m.category === 'chat'
    }
  })
}

// 按上游分组的模型数据
const groupedModels = computed(() => {
  const groups: Array<{
    upstreamId: number
    upstreamName: string
    aimodels: BaseAimodel[]
  }> = []

  for (const upstream of props.upstreams) {
    const filteredModels = filterModelsByCategory(upstream.aimodels || [])
    if (filteredModels.length > 0) {
      groups.push({
        upstreamId: upstream.id,
        upstreamName: upstream.name,
        aimodels: filteredModels
      })
    }
  }

  return groups
})

// 是否有可用模型
const hasModels = computed(() => groupedModels.value.some(g => g.aimodels.length > 0))

// 当前选中的上游配置
const selectedUpstream = computed(() => {
  return props.upstreams.find(u => u.id === selectedUpstreamId.value)
})

// 当前选中的 AI 模型
const selectedAimodel = computed((): BaseAimodel | undefined => {
  if (!selectedUpstream.value || !selectedAimodelId.value) return undefined
  return selectedUpstream.value.aimodels?.find(
    m => m.id === selectedAimodelId.value
  )
})

// 当前显示文本
const currentDisplayText = computed(() => {
  if (!selectedUpstreamId.value || !selectedAimodelId.value) {
    return '选择模型'
  }
  const upstream = props.upstreams.find(u => u.id === selectedUpstreamId.value)
  if (!upstream) return '选择模型'

  // 获取选中的 AI 模型
  const aimodel = upstream.aimodels?.find(m => m.id === selectedAimodelId.value)
  if (!aimodel) return `${upstream.name} / 未知模型`

  // 使用 name 字段作为显示名称
  return `${upstream.name} / ${aimodel.name}`
})

// 获取模型图标
function getModelIcon(modelType: string): string {
  return MODEL_TYPE_ICONS[modelType as keyof typeof MODEL_TYPE_ICONS] || 'i-heroicons-sparkles'
}

// 获取模型显示文本
function getModelDisplayText(aimodel: BaseAimodel): string {
  return aimodel.name
}

// 当配置列表变化时,选择第一个配置（已按 sortOrder 排序）
watch(() => props.upstreams, (upstreams) => {
  if (props.noAutoSelect) return
  if (upstreams.length > 0 && !selectedUpstreamId.value) {
    // upstreams 已按 sortOrder 排序，直接选择第一个
    const firstUpstream = upstreams[0]
    if (firstUpstream) {
      const filteredModels = filterModelsByCategory(firstUpstream.aimodels || [])
      const firstModel = filteredModels[0]
      if (firstModel) {
        handleSelectModel(firstUpstream.id, firstModel.id)
      }
    }
  }
}, { immediate: true })

// 当选中的上游变化时，检查当前模型是否仍然有效
watch(selectedUpstreamId, (newId) => {
  if (!newId) return
  const upstream = props.upstreams.find(u => u.id === newId)
  if (!upstream) return

  const filteredModels = filterModelsByCategory(upstream.aimodels || [])
  const validIds = filteredModels.map(m => m.id)

  if (!selectedAimodelId.value || !validIds.includes(selectedAimodelId.value)) {
    const firstModel = filteredModels[0]
    if (firstModel) {
      selectedAimodelId.value = firstModel.id
      emit('update:aimodelId', selectedAimodelId.value)
    }
  }
})

// 暴露给父组件
defineExpose({
  selectedUpstream,
  selectedAimodel,
})
</script>

<template>
  <div>
    <!-- 空状态 -->
    <div v-if="upstreams.length === 0" class="text-xs text-(--ui-text-muted) flex items-center">
      <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 mr-1" />
      请先在设置中添加{{ category === 'chat' ? '对话' : category === 'video' ? '视频' : '绘图' }}模型
    </div>

    <!-- 触发按钮 -->
    <div v-else>
      <button
        type="button"
        class="flex items-center justify-between transition-colors"
        :class="[
          compact
            ? 'gap-2 px-2 py-1 rounded text-sm hover:bg-(--ui-bg-accented)'
            : [
                'gap-2 w-full px-3 py-2 rounded-lg border border-(--ui-border) bg-(--ui-bg) text-sm',
                hideTextOnMobile ? 'md:min-w-48 px-2 md:px-3 md:w-full' : 'min-w-48'
              ],
          {
            'opacity-50 cursor-not-allowed': !hasModels,
            'hover:bg-(--ui-bg-elevated)': !readOnly && hasModels && !compact,
            'cursor-default': readOnly
          }
        ]"
        :disabled="!hasModels || readOnly"
        @click="openModal"
      >
        <span class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" :class="'w-4 h-4'" class="text-(--ui-text-muted)" />
          <span :class="['text-(--ui-text)', hideTextOnMobile ? 'hidden md:inline' : '']">{{ currentDisplayText }}</span>
        </span>
        <UIcon
          v-if="!readOnly"
          name="i-heroicons-chevron-down"
          :class="['w-4 h-4 text-(--ui-text-muted)', hideTextOnMobile ? 'hidden md:inline' : '']"
        />
      </button>
    </div>

    <!-- 模态框 -->
    <UModal v-model:open="isModalOpen" title="选择模型" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <!-- 搜索和筛选 -->
          <div class="flex items-center gap-3">
            <UInput
              v-model="searchQuery"
              placeholder="搜索模型..."
              icon="i-heroicons-magnifying-glass"
              class="flex-1"
              autofocus
            />
            <USelect
              v-model="upstreamFilter"
              :items="upstreamOptions"
              value-key="value"
              label-key="label"
              class="w-40"
            />
            <UButton
              v-if="searchQuery || upstreamFilter !== 'all'"
              variant="ghost"
              size="sm"
              @click="resetFilters"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
            </UButton>
          </div>

          <!-- 模型列表 -->
          <div class="max-h-96 overflow-y-auto space-y-3">
            <!-- 无结果提示 -->
            <div v-if="filteredGroupedModels.length === 0" class="text-center py-12">
              <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 mx-auto mb-3 text-(--ui-text-dimmed) opacity-50" />
              <p class="text-(--ui-text-muted) mb-4">未找到匹配的模型</p>
              <UButton
                v-if="searchQuery || upstreamFilter !== 'all'"
                variant="soft"
                size="sm"
                @click="resetFilters"
              >
                <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
                重置筛选
              </UButton>
              <UButton
                v-else
                variant="soft"
                size="sm"
                @click="router.push('/settings/upstreams')"
              >
                <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
                添加上游
              </UButton>
            </div>

            <!-- 按上游分组 -->
            <div v-for="group in filteredGroupedModels" :key="group.upstreamId" class="space-y-2">
              <!-- 上游标题 -->
              <div class="flex items-center justify-between px-2 py-1 bg-(--ui-bg-muted) rounded-lg sticky top-0 z-10">
                <span class="text-xs font-medium text-(--ui-text-muted)">{{ group.upstreamName }}</span>
                <button
                  type="button"
                  class="p-1 hover:bg-(--ui-bg-accented) rounded text-(--ui-text-muted) hover:text-(--ui-text)"
                  @click.stop="router.push(`/settings/upstreams/${group.upstreamId}`)"
                >
                  <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- 模型网格 -->
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="aimodel in group.aimodels"
                  :key="aimodel.id"
                  type="button"
                  :data-aimodel-id="aimodel.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors border"
                  :class="[
                    isSelected(group.upstreamId, aimodel.id)
                      ? 'bg-(--ui-primary)/10 text-(--ui-primary) border-(--ui-primary)'
                      : 'hover:bg-(--ui-bg-accented) text-(--ui-text) border-(--ui-border) hover:border-(--ui-primary)'
                  ]"
                  @click="handleSelectModel(group.upstreamId, aimodel.id)"
                >
                  <UIcon :name="getModelIcon(aimodel.modelType)" class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ getModelDisplayText(aimodel) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { ModelCategory } from '~/shared/types'
import { MODEL_TYPE_ICONS } from '~/shared/constants'

const props = defineProps<{
  upstreams: Upstream[]
  category: ModelCategory
  upstreamId?: number | null
  aimodelId?: number | null
  // 下拉面板宽度，默认 w-80 (320px)
  dropdownWidth?: string
  // 使用列表布局而非 grid 布局
  listLayout?: boolean
  // 禁用自动选择默认配置
  noAutoSelect?: boolean
  // 下拉框右对齐（向左展开）
  alignRight?: boolean
}>()

const emit = defineEmits<{
  'update:upstreamId': [id: number | null]
  'update:aimodelId': [id: number | null]
}>()

const router = useRouter()

// 下拉框状态
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const dropUp = ref(false)

// 内部状态
const selectedUpstreamId = ref<number | null>(props.upstreamId ?? null)
const selectedAimodelId = ref<number | null>(props.aimodelId ?? null)

// 同步 props 到内部状态
watch(() => props.upstreamId, (val) => {
  selectedUpstreamId.value = val ?? null
})
watch(() => props.aimodelId, (val) => {
  selectedAimodelId.value = val ?? null
})

// 点击外部关闭下拉框
onClickOutside(dropdownRef, () => {
  isOpen.value = false
})

// 计算弹出方向
function calculateDropDirection() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  // 下拉面板最大高度 320px (max-h-80)
  dropUp.value = spaceBelow < 320 && spaceAbove > spaceBelow
}

// 切换下拉框
function toggleDropdown() {
  if (!isOpen.value) {
    calculateDropDirection()
  }
  isOpen.value = !isOpen.value
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
function filterModelsByCategory(aimodels: Aimodel[]): Aimodel[] {
  return aimodels.filter(m => {
    if (props.category === 'image') {
      return m.category === 'image' || (!m.category && isImageModelType(m.modelType))
    } else if (props.category === 'video') {
      return m.category === 'video'
    } else {
      return m.category === 'chat' ||
        (!m.category && m.apiFormat === 'openai-chat' && !isImageModelType(m.modelType))
    }
  })
}

// 按上游分组的模型数据
const groupedModels = computed(() => {
  const groups: Array<{
    upstreamId: number
    upstreamName: string
    aimodels: Aimodel[]
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
const selectedAimodel = computed((): Aimodel | undefined => {
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
function getModelDisplayText(aimodel: Aimodel): string {
  return aimodel.name
}

// 检查模型是否选中
function isSelected(upstreamId: number, aimodelId: number): boolean {
  return selectedUpstreamId.value === upstreamId && selectedAimodelId.value === aimodelId
}

// 选择模型
function handleSelectModel(upstreamId: number, aimodelId: number) {
  selectedUpstreamId.value = upstreamId
  selectedAimodelId.value = aimodelId
  emit('update:upstreamId', upstreamId)
  emit('update:aimodelId', aimodelId)
  isOpen.value = false
}

// 当配置列表变化时，选择第一个配置（已按 sortOrder 排序）
watch(() => props.upstreams, (upstreams) => {
  if (props.noAutoSelect) return
  if (upstreams.length > 0 && !selectedUpstreamId.value) {
    // upstreams 已按 sortOrder 排序，直接选择第一个
    const firstUpstream = upstreams[0]
    if (firstUpstream) {
      const filteredModels = filterModelsByCategory(firstUpstream.aimodels || [])
      if (filteredModels.length > 0) {
        handleSelectModel(firstUpstream.id, filteredModels[0].id)
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
    if (filteredModels.length > 0) {
      selectedAimodelId.value = filteredModels[0].id
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
  <div ref="dropdownRef" class="relative">
    <!-- 空状态 -->
    <div v-if="upstreams.length === 0" class="text-xs text-(--ui-text-muted) flex items-center">
      <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 mr-1" />
      请先在设置中添加{{ category === 'chat' ? '对话' : category === 'video' ? '视频' : '绘图' }}模型
    </div>

    <!-- 触发按钮 -->
    <div v-else ref="triggerRef">
      <button
        type="button"
        class="flex items-center justify-between gap-2 w-full min-w-48 px-3 py-2 rounded-lg border border-(--ui-border) bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors text-sm"
        :class="{ 'opacity-50 cursor-not-allowed': !hasModels }"
        :disabled="!hasModels"
        @click="toggleDropdown"
      >
        <span class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-(--ui-text-muted)" />
          <span class="text-(--ui-text)">{{ currentDisplayText }}</span>
        </span>
        <UIcon
          name="i-heroicons-chevron-down"
          class="w-4 h-4 text-(--ui-text-muted) transition-transform"
          :class="{ 'rotate-180': isOpen }"
        />
      </button>
    </div>

    <!-- 下拉面板 -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen && hasModels"
        class="absolute z-50 max-h-80 overflow-y-auto rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) shadow-lg"
        :class="[dropUp ? 'bottom-full mb-1' : 'top-full mt-1', dropdownWidth || 'w-80', alignRight ? 'right-0' : 'left-0']"
      >
        <!-- 按上游分组 -->
        <div v-for="(group, index) in groupedModels" :key="group.upstreamId">
          <!-- 分隔线 -->
          <div v-if="index > 0" class="border-t border-(--ui-border)" />

          <!-- 上游标题 -->
          <div class="flex items-center justify-between px-3 py-2 bg-(--ui-bg-muted)">
            <span class="text-xs font-medium text-(--ui-text-muted)">{{ group.upstreamName }}</span>
            <button
              class="p-1 hover:bg-(--ui-bg-accented) rounded text-(--ui-text-muted) hover:text-(--ui-text)"
              @click.stop="router.push(`/settings/upstreams/${group.upstreamId}`)"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 模型列表 -->
          <div :class="listLayout ? 'flex flex-col gap-1 p-2' : 'grid grid-cols-2 gap-2 p-2'">
            <button
              v-for="aimodel in group.aimodels"
              :key="aimodel.id"
              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors"
              :class="[
                isSelected(group.upstreamId, aimodel.id)
                  ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'hover:bg-(--ui-bg-accented) text-(--ui-text)',
                listLayout ? '' : 'border border-(--ui-border) hover:border-(--ui-primary)'
              ]"
              @click="handleSelectModel(group.upstreamId, aimodel.id)"
            >
              <UIcon :name="getModelIcon(aimodel.modelType)" class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ getModelDisplayText(aimodel) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

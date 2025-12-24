<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import type { ModelConfig, ModelTypeConfig } from '~/composables/useTasks'
import type { ModelCategory } from '~/shared/types'
import { MODEL_TYPE_ICONS, MODEL_TYPE_LABELS } from '~/shared/constants'

const props = defineProps<{
  modelConfigs: ModelConfig[]
  category: ModelCategory
  configId?: number | null
  modelName?: string | null
  // 显示模型类型标签而非模型名称
  showTypeLabel?: boolean
  // 下拉面板宽度，默认 w-80 (320px)
  dropdownWidth?: string
  // 使用列表布局而非 grid 布局
  listLayout?: boolean
}>()

const emit = defineEmits<{
  'update:configId': [id: number | null]
  'update:modelName': [name: string | null]
}>()

const router = useRouter()

// 下拉框状态
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const dropUp = ref(false)

// 内部状态
const selectedConfigId = ref<number | null>(props.configId ?? null)
const selectedModelName = ref<string | null>(props.modelName ?? null)

// 同步 props 到内部状态
watch(() => props.configId, (val) => {
  selectedConfigId.value = val ?? null
})
watch(() => props.modelName, (val) => {
  selectedModelName.value = val ?? null
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
function filterModelsByCategory(models: ModelTypeConfig[]): ModelTypeConfig[] {
  return models.filter(m => {
    if (props.category === 'image') {
      return m.category === 'image' || (!m.category && isImageModelType(m.modelType))
    } else {
      return m.category === 'chat' ||
        (!m.category && m.apiFormat === 'openai-chat' && !isImageModelType(m.modelType))
    }
  })
}

// 按上游分组的模型数据
const groupedModels = computed(() => {
  const groups: Array<{
    configId: number
    configName: string
    models: ModelTypeConfig[]
  }> = []

  for (const config of props.modelConfigs) {
    const filteredModels = filterModelsByCategory(config.modelTypeConfigs || [])
    if (filteredModels.length > 0) {
      groups.push({
        configId: config.id,
        configName: config.name,
        models: filteredModels
      })
    }
  }

  return groups
})

// 是否有可用模型
const hasModels = computed(() => groupedModels.value.some(g => g.models.length > 0))

// 当前选中的配置
const selectedConfig = computed(() => {
  return props.modelConfigs.find(c => c.id === selectedConfigId.value)
})

// 当前选中的模型类型配置
const selectedModelTypeConfig = computed((): ModelTypeConfig | undefined => {
  if (!selectedConfig.value || !selectedModelName.value) return undefined
  return selectedConfig.value.modelTypeConfigs?.find(
    m => m.modelName === selectedModelName.value
  )
})

// 当前显示文本
const currentDisplayText = computed(() => {
  if (!selectedConfigId.value || !selectedModelName.value) {
    return '选择模型'
  }
  const config = props.modelConfigs.find(c => c.id === selectedConfigId.value)
  if (!config) return '选择模型'

  // 获取选中的模型配置
  const modelConfig = config.modelTypeConfigs?.find(m => m.modelName === selectedModelName.value)
  if (!modelConfig) return `${config.name} / ${selectedModelName.value}`

  // 根据 showTypeLabel 决定显示内容
  const displayName = props.showTypeLabel
    ? (MODEL_TYPE_LABELS[modelConfig.modelType as keyof typeof MODEL_TYPE_LABELS] || modelConfig.modelType)
    : selectedModelName.value

  return `${config.name} / ${displayName}`
})

// 获取模型图标
function getModelIcon(modelType: string): string {
  return MODEL_TYPE_ICONS[modelType as keyof typeof MODEL_TYPE_ICONS] || 'i-heroicons-sparkles'
}

// 获取模型显示文本
function getModelDisplayText(model: ModelTypeConfig): string {
  if (props.showTypeLabel) {
    return MODEL_TYPE_LABELS[model.modelType as keyof typeof MODEL_TYPE_LABELS] || model.modelType
  }
  return model.modelName
}

// 检查模型是否选中
function isSelected(configId: number, modelName: string): boolean {
  return selectedConfigId.value === configId && selectedModelName.value === modelName
}

// 选择模型
function handleSelectModel(configId: number, modelName: string) {
  selectedConfigId.value = configId
  selectedModelName.value = modelName
  emit('update:configId', configId)
  emit('update:modelName', modelName)
  isOpen.value = false
}

// 当配置列表变化时，选择默认配置
watch(() => props.modelConfigs, (configs) => {
  if (configs.length > 0 && !selectedConfigId.value) {
    const defaultConfig = configs.find(c => c.isDefault) || configs[0]
    const filteredModels = filterModelsByCategory(defaultConfig.modelTypeConfigs || [])
    if (filteredModels.length > 0) {
      handleSelectModel(defaultConfig.id, filteredModels[0].modelName)
    }
  }
}, { immediate: true })

// 当选中的上游变化时，检查当前模型是否仍然有效
watch(selectedConfigId, (newId) => {
  if (!newId) return
  const config = props.modelConfigs.find(c => c.id === newId)
  if (!config) return

  const filteredModels = filterModelsByCategory(config.modelTypeConfigs || [])
  const validNames = filteredModels.map(m => m.modelName)

  if (!selectedModelName.value || !validNames.includes(selectedModelName.value)) {
    if (filteredModels.length > 0) {
      selectedModelName.value = filteredModels[0].modelName
      emit('update:modelName', selectedModelName.value)
    }
  }
})

// 暴露给父组件
defineExpose({
  selectedConfig,
  selectedModelTypeConfig,
})
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- 空状态 -->
    <div v-if="modelConfigs.length === 0" class="text-xs text-(--ui-text-muted) flex items-center">
      <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 mr-1" />
      请先在设置中添加{{ category === 'chat' ? '对话' : '绘图' }}模型
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
        class="absolute z-50 max-h-80 overflow-y-auto rounded-lg border border-(--ui-border-accented) bg-(--ui-bg-elevated) shadow-lg"
        :class="[dropUp ? 'bottom-full mb-1' : 'top-full mt-1', dropdownWidth || 'w-80']"
      >
        <!-- 按上游分组 -->
        <div v-for="(group, index) in groupedModels" :key="group.configId">
          <!-- 分隔线 -->
          <div v-if="index > 0" class="border-t border-(--ui-border)" />

          <!-- 上游标题 -->
          <div class="flex items-center justify-between px-3 py-2 bg-(--ui-bg-muted)">
            <span class="text-xs font-medium text-(--ui-text-muted)">{{ group.configName }}</span>
            <button
              class="p-1 hover:bg-(--ui-bg-accented) rounded text-(--ui-text-muted) hover:text-(--ui-text)"
              @click.stop="router.push(`/settings/models/${group.configId}`)"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 模型列表 -->
          <div :class="listLayout ? 'flex flex-col gap-1 p-2' : 'grid grid-cols-2 gap-2 p-2'">
            <button
              v-for="model in group.models"
              :key="model.modelName"
              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors"
              :class="[
                isSelected(group.configId, model.modelName)
                  ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'hover:bg-(--ui-bg-accented) text-(--ui-text)',
                listLayout ? '' : 'border border-(--ui-border-accented) hover:border-(--ui-primary)'
              ]"
              @click="handleSelectModel(group.configId, model.modelName)"
            >
              <UIcon :name="getModelIcon(model.modelType)" class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ getModelDisplayText(model) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

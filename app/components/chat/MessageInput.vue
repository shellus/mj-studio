<script setup lang="ts">
import type { ModelConfig, ModelTypeConfig } from '~/composables/useTasks'

const props = defineProps<{
  modelConfigs: ModelConfig[]
  currentConfigId: number | null
  currentModelName: string | null
  disabled: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  updateModel: [configId: number, modelName: string]
}>()

const router = useRouter()
const content = ref('')
const textareaRef = ref<HTMLTextAreaElement>()

// 当前选中的上游配置
const selectedConfigId = ref<number | null>(props.currentConfigId)
const selectedModelName = ref<string | null>(props.currentModelName)

// 监听 props 变化
watch(() => props.currentConfigId, (val) => {
  selectedConfigId.value = val
})
watch(() => props.currentModelName, (val) => {
  selectedModelName.value = val
})

// 判断是否是绘图模型
function isImageModel(modelType: string): boolean {
  const imageModels = [
    'midjourney', 'gemini', 'flux', 'dalle', 'doubao',
    'gpt4o-image', 'grok-image', 'qwen-image'
  ]
  return imageModels.includes(modelType)
}

// 获取所有对话模型（扁平化：上游 + 模型）
const allChatModels = computed(() => {
  const result: Array<{
    configId: number
    configName: string
    modelName: string
  }> = []

  for (const config of props.modelConfigs) {
    for (const model of config.modelTypeConfigs || []) {
      const isChat = model.category === 'chat' ||
        (!model.category && model.apiFormat === 'openai-chat' && !isImageModel(model.modelType))

      if (isChat) {
        result.push({
          configId: config.id,
          configName: config.name,
          modelName: model.modelName
        })
      }
    }
  }

  return result
})

// 当前选中的显示文本
const currentDisplayText = computed(() => {
  if (!selectedConfigId.value || !selectedModelName.value) {
    return '选择模型'
  }
  const config = props.modelConfigs.find(c => c.id === selectedConfigId.value)
  if (!config) return '选择模型'
  return `${config.name} / ${selectedModelName.value}`
})

// 下拉菜单项（按上游分组）
const modelDropdownItems = computed(() => {
  const groups: any[][] = []

  // 按上游分组
  const configMap = new Map<number, { name: string, models: string[] }>()
  for (const item of allChatModels.value) {
    if (!configMap.has(item.configId)) {
      configMap.set(item.configId, { name: item.configName, models: [] })
    }
    configMap.get(item.configId)!.models.push(item.modelName)
  }

  // 构建分组菜单
  for (const [configId, { name, models }] of configMap) {
    const group: any[] = [
      {
        label: name,
        configId, // 用于 slot 中获取 configId
        isConfigHeader: true, // 标记为上游标题
        disabled: true, // 禁止整行点击
        class: 'font-medium text-(--ui-text-muted) text-xs',
      }
    ]
    for (const modelName of models) {
      group.push({
        label: modelName,
        class: 'pl-6',
        onSelect: () => handleSelectModel(configId, modelName)
      })
    }
    groups.push(group)
  }

  return groups
})

// 选择模型
function handleSelectModel(configId: number, modelName: string) {
  selectedConfigId.value = configId
  selectedModelName.value = modelName
  emit('updateModel', configId, modelName)
}

// 发送消息
function handleSend() {
  const text = content.value.trim()
  if (!text || props.disabled) return

  emit('send', text)
  content.value = ''

  // 重置 textarea 高度
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// 自动调整 textarea 高度
function handleInput() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + 'px'
  }
}
</script>

<template>
  <div class="border-t border-(--ui-border) p-4">
    <!-- 模型选择器 -->
    <div class="flex gap-2 mb-3">
      <UDropdownMenu :items="modelDropdownItems">
        <UButton
          variant="ghost"
          size="sm"
          :disabled="allChatModels.length === 0"
        >
          <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 mr-1" />
          {{ currentDisplayText }}
          <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 ml-1" />
        </UButton>

        <template #item="{ item }">
          <div
            v-if="item.isConfigHeader"
            class="flex items-center justify-between w-full"
          >
            <span>{{ item.label }}</span>
            <button
              class="p-1 hover:bg-(--ui-bg-accented) rounded"
              @click.stop="router.push(`/settings/${item.configId}`)"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
            </button>
          </div>
          <span v-else>{{ item.label }}</span>
        </template>
      </UDropdownMenu>

      <div v-if="allChatModels.length === 0" class="text-xs text-(--ui-text-muted) flex items-center">
        <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 mr-1" />
        请先在设置中添加对话模型
      </div>
    </div>

    <!-- 输入框 -->
    <div class="flex gap-2 items-end">
      <textarea
        ref="textareaRef"
        v-model="content"
        class="flex-1 resize-none bg-(--ui-bg-elevated) border border-(--ui-border) rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--ui-primary) min-h-[48px] max-h-[200px]"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows="1"
        :disabled="disabled"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <UButton
        color="primary"
        class="h-[48px] w-[48px] flex-shrink-0"
        :disabled="!content.trim() || disabled || !selectedConfigId || !selectedModelName"
        @click="handleSend"
      >
        <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
      </UButton>
    </div>
  </div>
</template>

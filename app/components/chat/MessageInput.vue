<script setup lang="ts">
import type { ModelConfig, ModelTypeConfig } from '~/composables/useTasks'
import type { Message } from '~/composables/useConversations'

const props = defineProps<{
  modelConfigs: ModelConfig[]
  currentConfigId: number | null
  currentModelName: string | null
  disabled: boolean
  isStreaming?: boolean
  messages?: Message[]
}>()

const emit = defineEmits<{
  send: [content: string]
  addMessage: [content: string, role: 'user' | 'assistant']
  updateModel: [configId: number, modelName: string]
  stop: []
  compress: []
}>()

const router = useRouter()
const content = ref('')
const textareaRef = ref<HTMLTextAreaElement>()
const showCompressHint = ref(false)

// 计算对话大小（从最后一个 summary 消息开始）
const conversationStats = computed(() => {
  if (!props.messages?.length) {
    return { size: 0, messageCount: 0, hasSummary: false }
  }

  // 找到最后一个 summary 消息的位置
  let startIndex = 0
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].mark === 'summary') {
      startIndex = i
      break
    }
  }

  // 计算从 summary 消息（包含）开始的内容大小
  const relevantMessages = props.messages.slice(startIndex)
  const size = relevantMessages.reduce((sum, msg) => {
    return sum + new TextEncoder().encode(msg.content).length
  }, 0)

  return {
    size,
    messageCount: relevantMessages.length,
    hasSummary: startIndex > 0,
  }
})

// 格式化大小显示
const sizeDisplay = computed(() => {
  const { size } = conversationStats.value
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
})

// 是否需要压缩提醒（超过100KB）
const needsCompressHint = computed(() => {
  return conversationStats.value.size >= 100 * 1024
})

// 监听是否需要显示压缩提醒
watch(needsCompressHint, (needs) => {
  if (needs && !showCompressHint.value) {
    showCompressHint.value = true
  }
})

// 关闭压缩提醒
function dismissCompressHint() {
  showCompressHint.value = false
}

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
  clearInput()
}

// 添加消息（不触发AI回复）
function handleAddMessage(role: 'user' | 'assistant') {
  const text = content.value.trim()
  if (!text || props.disabled) return

  emit('addMessage', text, role)
  clearInput()
}

// 停止生成
function handleStop() {
  emit('stop')
}

// 清空输入框
function clearInput() {
  content.value = ''
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
    <!-- 压缩提醒 -->
    <div
      v-if="showCompressHint && needsCompressHint"
      class="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 flex items-center justify-between"
    >
      <div class="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
        <span>对话内容较长（{{ sizeDisplay }}），建议压缩以节省 Token</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton size="xs" color="warning" @click="emit('compress')">
          压缩对话
        </UButton>
        <button class="text-amber-500 hover:text-amber-700" @click="dismissCompressHint">
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 对话统计 -->
    <div v-if="messages?.length" class="flex items-center gap-3 mb-2 text-xs text-(--ui-text-muted)">
      <span>{{ conversationStats.messageCount }} 条消息</span>
      <span>{{ sizeDisplay }}</span>
      <span v-if="conversationStats.hasSummary" class="text-amber-600 dark:text-amber-400">
        (已压缩)
      </span>
      <button
        v-if="conversationStats.messageCount >= 3"
        class="text-(--ui-primary) hover:underline flex items-center gap-1"
        @click="emit('compress')"
      >
        <UIcon name="i-heroicons-archive-box-arrow-down" class="w-3 h-3" />
        压缩对话
      </button>
    </div>

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
        :disabled="disabled || isStreaming"
        @keydown="handleKeydown"
        @input="handleInput"
      />

      <!-- 停止按钮（流式输出时显示） -->
      <UButton
        v-if="isStreaming"
        color="error"
        class="h-[48px] w-[48px] flex-shrink-0"
        @click="handleStop"
      >
        <UIcon name="i-heroicons-stop" class="w-5 h-5" />
      </UButton>

      <!-- 发送按钮组（非流式时显示） -->
      <template v-else>
        <!-- 发送按钮 -->
        <UButton
          color="primary"
          class="h-[48px] w-[48px] flex-shrink-0"
          :disabled="!content.trim() || disabled || !selectedConfigId || !selectedModelName"
          @click="handleSend"
        >
          <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
        </UButton>

        <!-- 添加消息下拉菜单 -->
        <UDropdownMenu
          :items="[
            [
              { label: '添加用户消息', icon: 'i-heroicons-user', onSelect: () => handleAddMessage('user') },
              { label: '添加AI消息', icon: 'i-heroicons-sparkles', onSelect: () => handleAddMessage('assistant') },
            ]
          ]"
        >
          <UButton
            variant="outline"
            class="h-[48px] w-[36px] flex-shrink-0"
            :disabled="!content.trim() || disabled"
          >
            <UIcon name="i-heroicons-plus" class="w-4 h-4" />
          </UButton>
        </UDropdownMenu>
      </template>
    </div>
  </div>
</template>

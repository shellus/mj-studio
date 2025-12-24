<script setup lang="ts">
import type { ModelConfig, ModelTypeConfig } from '~/composables/useTasks'
import type { Message, UploadingFile } from '~/composables/useConversations'
import type { MessageFile } from '~/shared/types'

const props = defineProps<{
  modelConfigs: ModelConfig[]
  currentConfigId: number | null
  currentModelName: string | null
  disabled: boolean
  isStreaming?: boolean
  messages?: Message[]
  // 受控状态
  content: string
  uploadingFiles: UploadingFile[]
  showCompressHint: boolean
}>()

const emit = defineEmits<{
  send: [content: string, files?: MessageFile[]]
  addMessage: [content: string, role: 'user' | 'assistant']
  updateModel: [configId: number, modelName: string]
  stop: []
  compress: []
  scrollToCompress: []
  // 状态更新事件
  'update:content': [value: string]
  'update:uploadingFiles': [files: UploadingFile[]]
  'update:showCompressHint': [value: boolean]
}>()

const router = useRouter()
const textareaRef = ref<HTMLTextAreaElement>()
const fileInputRef = ref<HTMLInputElement>()
const isDragging = ref(false)

// 已上传完成的文件
const uploadedFiles = computed(() =>
  props.uploadingFiles
    .filter(f => f.status === 'done' && f.result)
    .map(f => f.result!)
)

// 是否有文件正在上传
const isUploading = computed(() =>
  props.uploadingFiles.some(f => f.status === 'uploading')
)

// 判断是否为图片类型
function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// 文件转 base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 上传单个文件
async function uploadFile(file: File) {
  const id = generateId()
  const uploadingFile: UploadingFile = {
    id,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    status: 'uploading',
    progress: 0,
    previewUrl: isImageMimeType(file.type) ? URL.createObjectURL(file) : undefined,
  }

  const newFiles = [...props.uploadingFiles, uploadingFile]
  emit('update:uploadingFiles', newFiles)

  // 找到数组中的索引，用于响应式更新
  const index = newFiles.length - 1

  try {
    // 使用 FormData 上传文件
    const formData = new FormData()
    formData.append('file', file)

    const response = await $fetch<{
      success: boolean
      fileName: string
      url: string
      mimeType: string
      size: number
    }>('/api/files/upload', {
      method: 'POST',
      body: formData,
    })

    // 响应式更新
    const updatedFiles = [...props.uploadingFiles]
    updatedFiles[index] = {
      ...updatedFiles[index],
      status: 'done',
      progress: 100,
      result: {
        name: file.name,
        fileName: response.fileName,
        mimeType: response.mimeType,
        size: response.size,
      },
    }
    emit('update:uploadingFiles', updatedFiles)
  } catch (error: any) {
    const updatedFiles = [...props.uploadingFiles]
    updatedFiles[index] = {
      ...updatedFiles[index],
      status: 'error',
      error: error.message || '上传失败',
    }
    emit('update:uploadingFiles', updatedFiles)
  }
}

// 处理文件选择
async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  for (const file of files) {
    await uploadFile(file)
  }

  // 清空 input 以便重复选择同一文件
  input.value = ''
}

// 处理拖拽
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (!files?.length) return

  for (const file of files) {
    await uploadFile(file)
  }
}

// 移除文件
function removeFile(id: string) {
  const index = props.uploadingFiles.findIndex(f => f.id === id)
  if (index >= 0) {
    const file = props.uploadingFiles[index]
    // 释放预览 URL
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl)
    }
    const newFiles = props.uploadingFiles.filter(f => f.id !== id)
    emit('update:uploadingFiles', newFiles)
  }
}

// 触发文件选择
function triggerFileSelect() {
  fileInputRef.value?.click()
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// 获取文件图标
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'i-heroicons-photo'
  if (mimeType.startsWith('video/')) return 'i-heroicons-video-camera'
  if (mimeType.startsWith('audio/')) return 'i-heroicons-musical-note'
  if (mimeType.includes('pdf')) return 'i-heroicons-document-text'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'i-heroicons-document'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'i-heroicons-table-cells'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'i-heroicons-presentation-chart-bar'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'i-heroicons-archive-box'
  return 'i-heroicons-document'
}

// 计算对话大小（模拟发送给 AI 的上下文）
// 从最后一个 compress-response 开始，排除 compress-request
const conversationStats = computed(() => {
  if (!props.messages?.length) {
    return { size: 0, messageCount: 0, hasCompressed: false, fileCount: 0 }
  }

  // 找到最后一个 compress-response 消息的位置
  let startIndex = 0
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].mark === 'compress-response') {
      startIndex = i
      break
    }
  }

  // 从 compress-response 开始，排除 compress-request
  const relevantMessages = props.messages
    .slice(startIndex)
    .filter(msg => msg.mark !== 'compress-request')

  let fileCount = 0
  const size = relevantMessages.reduce((sum, msg) => {
    let msgSize = new TextEncoder().encode(msg.content).length
    // 计算文件大小（图片会转为 base64，大小约为原始的 4/3）
    if (msg.files?.length) {
      fileCount += msg.files.length
      for (const file of msg.files) {
        // 只有图片会作为 base64 发送给 AI
        if (file.mimeType.startsWith('image/')) {
          msgSize += Math.ceil(file.size * 4 / 3) // base64 编码后的大小
        }
      }
    }
    return sum + msgSize
  }, 0)

  return {
    size,
    messageCount: relevantMessages.length,
    hasCompressed: startIndex > 0,
    fileCount,
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
  if (needs && !props.showCompressHint) {
    emit('update:showCompressHint', true)
  }
})

// 关闭压缩提醒
function dismissCompressHint() {
  emit('update:showCompressHint', false)
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
  const text = props.content.trim()
  const files = uploadedFiles.value

  // 必须有文本或文件
  if (!text && files.length === 0) return
  // 发送时只检查上传状态，不检查 disabled（新对话时 disabled=true 但应该可以发送）
  if (isUploading.value) return

  emit('send', text, files.length > 0 ? files : undefined)
  clearInput()
}

// 添加消息（不触发AI回复）
function handleAddMessage(role: 'user' | 'assistant') {
  const text = props.content.trim()
  if (!text || props.disabled) return

  emit('addMessage', text, role)
  clearInput()
}

// 停止生成
function handleStop() {
  emit('stop')
}

// 清空输入框和文件
function clearInput() {
  emit('update:content', '')
  // 释放所有预览 URL
  for (const file of props.uploadingFiles) {
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl)
    }
  }
  emit('update:uploadingFiles', [])
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

// 自动调整 textarea 高度并更新内容
function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:content', target.value)
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
      v-if="props.showCompressHint && needsCompressHint"
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
    <div v-if="messages?.length" class="flex items-center gap-3 mb-2 text-xs text-(--ui-text-muted) pl-2">
      <span>{{ conversationStats.messageCount }} 条消息</span>
      <span>{{ sizeDisplay }}</span>
      <button
        v-if="conversationStats.hasCompressed"
        class="text-amber-600 dark:text-amber-400 hover:underline"
        @click="emit('scrollToCompress')"
      >
        (已压缩)
      </button>
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

    <!-- 文件预览区域 -->
    <div v-if="props.uploadingFiles.length > 0" class="mb-3 flex flex-wrap gap-2 pb-5">
      <div
        v-for="file in props.uploadingFiles"
        :key="file.id"
        class="relative group"
      >
        <!-- 图片预览 -->
        <div
          v-if="isImageMimeType(file.mimeType) && file.previewUrl"
          class="w-16 h-16 rounded-lg overflow-hidden border border-(--ui-border) bg-(--ui-bg-elevated)"
        >
          <img
            :src="file.previewUrl"
            :alt="file.name"
            class="w-full h-full object-cover"
          />
        </div>
        <!-- 非图片文件 -->
        <div
          v-else
          class="w-16 h-16 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) flex flex-col items-center justify-center p-1"
        >
          <UIcon :name="getFileIcon(file.mimeType)" class="w-6 h-6 text-(--ui-text-muted)" />
          <span class="text-[10px] text-(--ui-text-muted) truncate w-full text-center mt-1">
            {{ file.name.split('.').pop() }}
          </span>
        </div>

        <!-- 上传中遮罩 -->
        <div
          v-if="file.status === 'uploading'"
          class="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-white animate-spin" />
        </div>

        <!-- 错误遮罩 -->
        <div
          v-if="file.status === 'error'"
          class="absolute inset-0 bg-red-500/50 rounded-lg flex items-center justify-center"
          :title="file.error"
        >
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-white" />
        </div>

        <!-- 删除按钮 -->
        <button
          class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          @click="removeFile(file.id)"
        >
          <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
        </button>

        <!-- 文件名提示 -->
        <div class="absolute -bottom-5 left-0 right-0 text-[10px] text-(--ui-text-muted) truncate text-center">
          {{ formatFileSize(file.size) }}
        </div>
      </div>
    </div>

    <!-- 输入框 -->
    <div
      class="flex gap-2 items-end"
      :class="{ 'ring-2 ring-(--ui-primary) rounded-xl': isDragging }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        @change="handleFileSelect"
      />

      <!-- 文件上传按钮 -->
      <UButton
        variant="ghost"
        class="h-[48px] w-[48px] flex-shrink-0"
        :disabled="disabled || isStreaming"
        @click="triggerFileSelect"
      >
        <UIcon name="i-heroicons-paper-clip" class="w-5 h-5" />
      </UButton>

      <textarea
        ref="textareaRef"
        :value="props.content"
        class="flex-1 resize-none bg-(--ui-bg-elevated) border border-(--ui-border) rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-(--ui-primary) min-h-[48px] max-h-[200px]"
        :placeholder="isDragging ? '松开以上传文件' : '输入消息，Enter 发送，Shift+Enter 换行'"
        rows="1"
        :disabled="disabled || isStreaming"
        @keydown="handleKeydown"
        @input="handleInput"
      />

      <!-- 停止按钮（流式输出时显示） -->
      <UButton
        v-if="isStreaming"
        color="error"
        class="h-[48px] w-[48px] flex-shrink-0 flex items-center justify-center"
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
          :disabled="(!props.content.trim() && uploadedFiles.length === 0) || isUploading || !selectedConfigId || !selectedModelName"
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
            :disabled="!props.content.trim() || disabled"
          >
            <UIcon name="i-heroicons-plus" class="w-4 h-4" />
          </UButton>
        </UDropdownMenu>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'
import type { ModelConfig } from '~/composables/useTasks'

const props = defineProps<{
  assistant: Assistant | null
  modelConfigs: ModelConfig[]
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Partial<Assistant>]
}>()

// 表单数据
const formData = ref({
  name: '',
  description: '',
  avatar: '',
  systemPrompt: '',
  modelConfigId: null as number | null,
  modelName: null as string | null,
  isDefault: false,
})

// 监听 assistant 变化，初始化表单
watch(() => props.assistant, (assistant) => {
  if (assistant) {
    formData.value = {
      name: assistant.name,
      description: assistant.description || '',
      avatar: assistant.avatar || '',
      systemPrompt: assistant.systemPrompt || '',
      modelConfigId: assistant.modelConfigId,
      modelName: assistant.modelName,
      isDefault: assistant.isDefault,
    }
  } else {
    formData.value = {
      name: '',
      description: '',
      avatar: '',
      systemPrompt: '',
      modelConfigId: null,
      modelName: null,
      isDefault: false,
    }
  }
}, { immediate: true })

// 判断是否是绘图模型
function isImageModel(modelType: string): boolean {
  const imageModels = [
    'midjourney', 'gemini', 'flux', 'dalle', 'doubao',
    'gpt4o-image', 'grok-image', 'qwen-image'
  ]
  return imageModels.includes(modelType)
}

// 当前选中配置的对话模型
const availableModels = computed(() => {
  const config = props.modelConfigs.find(c => c.id === formData.value.modelConfigId)
  if (!config) return []
  return (config.modelTypeConfigs || []).filter(m => {
    return m.category === 'chat' ||
      (!m.category && m.apiFormat === 'openai-chat' && !isImageModel(m.modelType))
  })
})

// 处理上游选择变化
function handleConfigChange(configId: number) {
  formData.value.modelConfigId = configId
  // 自动选择第一个对话模型
  const config = props.modelConfigs.find(c => c.id === configId)
  if (config) {
    const firstChatModel = (config.modelTypeConfigs || []).find(m => {
      return m.category === 'chat' ||
        (!m.category && m.apiFormat === 'openai-chat' && !isImageModel(m.modelType))
    })
    formData.value.modelName = firstChatModel?.modelName || null
  }
}

// 处理头像上传
async function handleAvatarUpload(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 限制大小 2MB
  if (file.size > 2 * 1024 * 1024) {
    alert('图片大小不能超过 2MB')
    return
  }

  // 转换为 base64
  const reader = new FileReader()
  reader.onload = () => {
    formData.value.avatar = reader.result as string
  }
  reader.readAsDataURL(file)
}

// 保存
function handleSave() {
  if (!formData.value.name.trim()) {
    alert('请输入助手名称')
    return
  }

  emit('save', {
    name: formData.value.name.trim(),
    description: formData.value.description.trim() || null,
    avatar: formData.value.avatar || null,
    systemPrompt: formData.value.systemPrompt.trim() || null,
    modelConfigId: formData.value.modelConfigId,
    modelName: formData.value.modelName,
    isDefault: formData.value.isDefault,
  })
}

// 关闭弹窗
function handleClose() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <h3 class="font-medium">{{ assistant ? '编辑助手' : '新建助手' }}</h3>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- 头像 -->
        <div>
          <label class="block text-sm font-medium mb-2">助手头像</label>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-full bg-(--ui-bg-elevated) flex items-center justify-center overflow-hidden border border-(--ui-border)">
              <img
                v-if="formData.avatar"
                :src="formData.avatar"
                class="w-full h-full object-cover"
              />
              <UIcon
                v-else
                name="i-heroicons-user-circle"
                class="w-10 h-10 text-(--ui-text-muted)"
              />
            </div>
            <label class="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleAvatarUpload"
              />
              <UButton variant="outline" size="sm" as="span">
                上传图片
              </UButton>
            </label>
            <UButton
              v-if="formData.avatar"
              variant="ghost"
              size="sm"
              color="error"
              @click="formData.avatar = ''"
            >
              移除
            </UButton>
          </div>
        </div>

        <!-- 名称 -->
        <div>
          <label class="block text-sm font-medium mb-2">助手名称 *</label>
          <UInput
            v-model="formData.name"
            placeholder="如：代码助手"
          />
        </div>

        <!-- 简介 -->
        <div>
          <label class="block text-sm font-medium mb-2">助手简介</label>
          <UInput
            v-model="formData.description"
            placeholder="简短描述助手的功能"
          />
        </div>

        <!-- 系统提示词 -->
        <div>
          <label class="block text-sm font-medium mb-2">系统提示词</label>
          <UTextarea
            v-model="formData.systemPrompt"
            :rows="4"
            placeholder="设置助手的行为和角色，如：你是一个专业的编程助手..."
          />
        </div>

        <!-- 上游选择 -->
        <div>
          <label class="block text-sm font-medium mb-2">上游</label>
          <USelectMenu
            :model-value="formData.modelConfigId"
            :items="modelConfigs.filter(c => (c.modelTypeConfigs || []).some(m => m.category === 'chat' || (!m.category && m.apiFormat === 'openai-chat' && !isImageModel(m.modelType)))).map(c => ({
              label: c.name,
              value: c.id
            }))"
            placeholder="选择上游"
            value-key="value"
            @update:model-value="handleConfigChange"
          />
        </div>

        <!-- 模型选择 -->
        <div>
          <label class="block text-sm font-medium mb-2">模型</label>
          <USelectMenu
            v-model="formData.modelName"
            :items="availableModels.map(m => ({
              label: m.modelName,
              value: m.modelName
            }))"
            placeholder="选择模型"
            value-key="value"
            :disabled="!formData.modelConfigId"
          />
        </div>

        <!-- 设为默认 -->
        <div class="flex items-center gap-2">
          <input
            v-model="formData.isDefault"
            type="checkbox"
            class="rounded"
          />
          <label class="text-sm">设为默认助手</label>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="handleClose">
          取消
        </UButton>
        <UButton color="primary" @click="handleSave">
          保存
        </UButton>
      </div>
    </template>
  </UModal>
</template>

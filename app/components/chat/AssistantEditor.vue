<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'
import type { Upstream, Aimodel } from '~/composables/useUpstreams'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'

const props = defineProps<{
  assistant: Assistant | null
  upstreams: Upstream[]
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Partial<Assistant>]
  delete: [id: number]
}>()

// 删除确认弹窗状态
const deleteConfirmOpen = ref(false)

// 表单数据
const formData = reactive({
  name: '',
  description: '',
  avatar: '',
  systemPrompt: '',
  upstreamId: null as number | null,
  aimodelId: null as number | null,
  modelName: null as string | null,
})

// 表单验证
function validate(state: typeof formData): FormError[] {
  const errors: FormError[] = []
  if (!state.name?.trim()) {
    errors.push({ name: 'name', message: '请输入助手名称' })
  }
  return errors
}

// 监听 assistant 变化，初始化表单
watch(() => props.assistant, (assistant) => {
  if (assistant) {
    Object.assign(formData, {
      name: assistant.name,
      description: assistant.description || '',
      avatar: assistant.avatar || '',
      systemPrompt: assistant.systemPrompt || '',
      upstreamId: assistant.upstreamId,
      aimodelId: assistant.aimodelId,
      modelName: assistant.modelName,
    })
  } else {
    Object.assign(formData, {
      name: '',
      description: '',
      avatar: '',
      systemPrompt: '',
      upstreamId: null,
      aimodelId: null,
      modelName: null,
    })
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

// 获取所有对话模型（扁平化：上游 + 模型）
const allChatModels = computed(() => {
  const result: Array<{
    upstreamId: number
    upstreamName: string
    aimodelId: number
    modelName: string
  }> = []

  for (const upstream of props.upstreams) {
    for (const aimodel of upstream.aimodels || []) {
      const isChat = aimodel.category === 'chat' ||
        (!aimodel.category && aimodel.apiFormat === 'openai-chat' && !isImageModel(aimodel.modelType))

      if (isChat) {
        result.push({
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          aimodelId: aimodel.id,
          modelName: aimodel.modelName
        })
      }
    }
  }

  return result
})

// 当前选中的显示文本
const currentDisplayText = computed(() => {
  if (!formData.upstreamId || !formData.aimodelId) {
    return '选择模型'
  }
  const upstream = props.upstreams.find(u => u.id === formData.upstreamId)
  if (!upstream) return '选择模型'
  return `${upstream.name} / ${formData.modelName || '未知模型'}`
})

// 下拉菜单项（按上游分组）
const modelDropdownItems = computed(() => {
  const groups: any[][] = []

  // 按上游分组
  const upstreamMap = new Map<number, { name: string, models: { aimodelId: number, modelName: string }[] }>()
  for (const item of allChatModels.value) {
    if (!upstreamMap.has(item.upstreamId)) {
      upstreamMap.set(item.upstreamId, { name: item.upstreamName, models: [] })
    }
    upstreamMap.get(item.upstreamId)!.models.push({ aimodelId: item.aimodelId, modelName: item.modelName })
  }

  // 构建分组菜单
  for (const [upstreamId, { name, models }] of upstreamMap) {
    const group: any[] = [
      { label: name, type: 'label' }
    ]
    for (const { aimodelId, modelName } of models) {
      group.push({
        label: modelName,
        onSelect: () => handleSelectModel(upstreamId, aimodelId, modelName)
      })
    }
    groups.push(group)
  }

  return groups
})

// 选择模型
function handleSelectModel(upstreamId: number, aimodelId: number, modelName: string) {
  formData.upstreamId = upstreamId
  formData.aimodelId = aimodelId
  formData.modelName = modelName
}

// 处理头像上传
async function handleAvatarUpload(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 限制大小 2MB
  if (file.size > 2 * 1024 * 1024) {
    useToast().add({ title: '图片大小不能超过 2MB', color: 'error' })
    return
  }

  // 转换为 base64
  const reader = new FileReader()
  reader.onload = () => {
    formData.avatar = reader.result as string
  }
  reader.readAsDataURL(file)
}

// 提交表单
function onSubmit(event: FormSubmitEvent<typeof formData>) {
  emit('save', {
    name: event.data.name.trim(),
    description: event.data.description?.trim() || null,
    avatar: event.data.avatar || null,
    systemPrompt: event.data.systemPrompt?.trim() || null,
    upstreamId: event.data.upstreamId,
    aimodelId: event.data.aimodelId,
    modelName: event.data.modelName,
  })
}

// 关闭弹窗
function handleClose() {
  emit('update:open', false)
}

// 确认删除
function handleDeleteConfirm() {
  if (props.assistant) {
    emit('delete', props.assistant.id)
    deleteConfirmOpen.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="assistant ? '编辑助手' : '新建助手'"
    :ui="{ content: 'sm:max-w-4xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm :state="formData" :validate="validate" class="space-y-5" @submit="onSubmit">
        <!-- 头像 + 名称 + 简介 同一行 -->
        <div class="flex gap-4">
          <!-- 头像（圆形样式） -->
          <div class="relative w-30 h-30 shrink-0 rounded-full overflow-hidden group">
            <img
              v-if="formData.avatar"
              :src="formData.avatar"
              class="w-full h-full object-cover"
            />
            <label
              v-else
              class="w-full h-full border-2 border-dashed border-(--ui-border-accented) hover:border-(--ui-primary) transition-colors flex flex-col items-center justify-center cursor-pointer rounded-full"
            >
              <UIcon name="i-heroicons-cloud-arrow-up" class="w-6 h-6 text-(--ui-text-dimmed) mb-1" />
              <span class="text-(--ui-text-dimmed) text-xs">上传</span>
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleAvatarUpload"
              />
            </label>
            <!-- 已有头像时的删除遮罩 -->
            <button
              v-if="formData.avatar"
              type="button"
              class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              @click="formData.avatar = ''"
            >
              <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
            </button>
          </div>

          <!-- 名称 + 模型配置 -->
          <div class="flex-1 space-y-3">
            <UFormField label="助手名称" name="name" required>
              <UInput
                v-model="formData.name"
                placeholder="如：代码助手"
                class="w-56"
              />
            </UFormField>
            <UFormField label="模型配置" name="modelConfig">
              <UDropdownMenu :items="modelDropdownItems">
                <UButton
                  variant="outline"
                  class="justify-between"
                  :disabled="allChatModels.length === 0"
                >
                  <span class="flex items-center gap-2">
                    <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4" />
                    {{ currentDisplayText }}
                  </span>
                  <UIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
                </UButton>
              </UDropdownMenu>
              <template v-if="allChatModels.length === 0" #help>
                请先在设置中添加对话模型
              </template>
            </UFormField>
          </div>
        </div>

        <!-- 简介 -->
        <UFormField label="助手简介" name="description">
          <UTextarea
            v-model="formData.description"
            placeholder="简短描述助手的功能"
            :rows="4"
            class="w-full"
          />
        </UFormField>

        <!-- 系统提示词 -->
        <UFormField label="系统提示词" name="systemPrompt">
          <UTextarea
            v-model="formData.systemPrompt"
            :rows="16"
            placeholder="设置助手的行为和角色，如：你是一个专业的编程助手..."
            class="w-full"
          />
        </UFormField>

        <!-- 底部按钮 -->
        <div class="flex justify-between pt-2">
          <!-- 左侧：删除按钮（仅编辑模式且非默认助手时显示） -->
          <div>
            <UButton
              v-if="assistant && !assistant.isDefault"
              color="error"
              variant="ghost"
              type="button"
              @click="deleteConfirmOpen = true"
            >
              删除助手
            </UButton>
          </div>
          <!-- 右侧：取消和保存 -->
          <div class="flex gap-2">
            <UButton variant="ghost" type="button" @click="handleClose">
              取消
            </UButton>
            <UButton color="primary" type="submit">
              保存
            </UButton>
          </div>
        </div>
      </UForm>
    </template>
  </UModal>

  <!-- 删除确认弹窗 -->
  <UModal
    v-model:open="deleteConfirmOpen"
    title="确认删除"
    :description="`确定要删除助手「${assistant?.name}」吗？该助手下的所有对话也将被删除，此操作不可撤销。`"
    :close="false"
  >
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton color="error" @click="handleDeleteConfirm">删除</UButton>
        <UButton variant="outline" color="neutral" @click="deleteConfirmOpen = false">取消</UButton>
      </div>
    </template>
  </UModal>
</template>

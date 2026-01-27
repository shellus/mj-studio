<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'
import type { Upstream } from '~/composables/useUpstreams'
import type { AvailableUpstream } from '~/composables/useAvailableUpstreams'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'

const props = defineProps<{
  assistant: Assistant | null
  upstreams: (Upstream | AvailableUpstream)[]
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Partial<Assistant>]
  delete: [id: number]
  duplicate: [id: number]
}>()

// 删除确认弹窗状态
const deleteConfirmOpen = ref(false)

// MCP 服务列表
const { servers, fetchServers } = useMcpServers()

// 表单数据
const formData = reactive({
  name: '',
  description: '',
  avatar: '',
  systemPrompt: '',
  aimodelId: null as number | null,
  enableThinking: false,
  mcpServerIds: [] as number[],
  autoApproveMcp: false,
})

// 表单验证
function validate(state: typeof formData): FormError[] {
  const errors: FormError[] = []
  if (!state.name?.trim()) {
    errors.push({ name: 'name', message: '请输入助手名称' })
  }
  return errors
}

// 加载助手的 MCP 服务关联
async function loadMcpServerIds(assistantId: number) {
  try {
    const { serverIds } = await $fetch<{ serverIds: number[] }>(`/api/assistants/${assistantId}/mcp-servers`)
    formData.mcpServerIds = serverIds
  } catch {
    formData.mcpServerIds = []
  }
}

// 监听 assistant 变化，初始化表单
watch(() => props.assistant, async (assistant) => {
  if (assistant) {
    Object.assign(formData, {
      name: assistant.name,
      description: assistant.description || '',
      avatar: assistant.avatar || '',
      systemPrompt: assistant.systemPrompt || '',
      aimodelId: assistant.aimodelId,
      enableThinking: assistant.enableThinking || false,
      mcpServerIds: [],
      autoApproveMcp: assistant.autoApproveMcp || false,
    })
    // 加载 MCP 服务关联
    await loadMcpServerIds(assistant.id)
  } else {
    Object.assign(formData, {
      name: '',
      description: '',
      avatar: '',
      systemPrompt: '',
      aimodelId: null,
      enableThinking: false,
      mcpServerIds: [],
      autoApproveMcp: false,
    })
  }
}, { immediate: true })

// 监听弹窗打开，确保 MCP 服务列表已加载
watch(() => props.open, (isOpen) => {
  if (isOpen && servers.value.length === 0) {
    fetchServers()
  }
})

// 处理头像上传
const isUploading = ref(false)

async function handleAvatarUpload(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 限制大小 500KB
  if (file.size > 500 * 1024) {
    useToast().add({ title: '图片大小不能超过 500KB', color: 'error' })
    return
  }

  // 上传到服务器
  isUploading.value = true
  try {
    const uploadData = new FormData()
    uploadData.append('file', file)
    const result = await $fetch<{ url: string }>('/api/images/upload', {
      method: 'POST',
      body: uploadData,
    })
    formData.avatar = result.url
  } catch (error) {
    useToast().add({ title: '上传失败', color: 'error' })
  } finally {
    isUploading.value = false
  }
}

// 切换 MCP 服务选择
function toggleMcpServer(serverId: number) {
  const index = formData.mcpServerIds.indexOf(serverId)
  if (index === -1) {
    formData.mcpServerIds.push(serverId)
  } else {
    formData.mcpServerIds.splice(index, 1)
  }
}

// 提交表单
function onSubmit(event: FormSubmitEvent<typeof formData>) {
  emit('save', {
    name: event.data.name.trim(),
    description: event.data.description?.trim() || null,
    avatar: event.data.avatar || null,
    systemPrompt: event.data.systemPrompt?.trim() || null,
    aimodelId: event.data.aimodelId,
    enableThinking: event.data.enableThinking,
    mcpServerIds: event.data.mcpServerIds,
    autoApproveMcp: event.data.autoApproveMcp,
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

// 复制助手
function handleDuplicate() {
  if (props.assistant) {
    emit('duplicate', props.assistant.id)
  }
}

// 活跃的 MCP 服务（仅显示已启用的）
const activeServers = computed(() => servers.value.filter(s => s.isActive))
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
        <!-- 头像 + 名称 + 模型 + 思考模式 同一区域 -->
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

          <!-- 名称 + 模型配置 + 思考模式（两列布局） -->
          <div class="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 content-start">
            <UFormField label="助手名称" name="name" required>
              <UInput
                v-model="formData.name"
                placeholder="如：代码助手"
              />
            </UFormField>
            <UFormField label="思考模式" name="enableThinking">
              <div class="flex items-center h-9">
                <USwitch v-model="formData.enableThinking" />
                <span class="ml-2 text-sm text-(--ui-text-muted)">深度思考</span>
              </div>
            </UFormField>
            <UFormField label="模型配置" name="modelConfig" class="col-span-2">
              <ModelSelector
                :upstreams="upstreams"
                category="chat"
                list-layout
                v-model:aimodel-id="formData.aimodelId"
              />
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

        <!-- MCP 服务 -->
        <UFormField v-if="activeServers.length > 0" label="MCP 服务" name="mcpServers">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="server in activeServers"
              :key="server.id"
              size="sm"
              :variant="formData.mcpServerIds.includes(server.id) ? 'solid' : 'outline'"
              :color="formData.mcpServerIds.includes(server.id) ? 'primary' : 'neutral'"
              type="button"
              @click="toggleMcpServer(server.id)"
            >
              <img
                v-if="server.logoUrl"
                :src="server.logoUrl"
                class="w-4 h-4 rounded mr-1"
              >
              <UIcon v-else name="i-heroicons-puzzle-piece" class="w-4 h-4 mr-1" />
              {{ server.name }}
            </UButton>
          </div>
          <p class="text-xs text-(--ui-text-muted) mt-2">
            选择要启用的 MCP 服务，让助手可以调用外部工具
          </p>
        </UFormField>

        <!-- 自动通过 MCP 调用 -->
        <UFormField v-if="activeServers.length > 0" label="自动通过 MCP 调用" name="autoApproveMcp">
          <div class="flex items-center h-9">
            <USwitch v-model="formData.autoApproveMcp" />
            <span class="ml-2 text-sm text-(--ui-text-muted)">新建对话时默认开启</span>
          </div>
          <p class="text-xs text-(--ui-text-muted) mt-1">
            开启后，新建对话的 MCP 工具调用将自动通过，无需手动确认
          </p>
        </UFormField>

        <!-- 底部按钮 -->
        <div class="flex justify-between pt-2">
          <!-- 左侧：删除和复制按钮（仅编辑模式显示） -->
          <div class="flex gap-2">
            <UButton
              v-if="assistant && !assistant.isDefault"
              color="error"
              variant="ghost"
              type="button"
              @click="deleteConfirmOpen = true"
            >
              删除助手
            </UButton>
            <UButton
              v-if="assistant"
              variant="ghost"
              type="button"
              @click="handleDuplicate"
            >
              复制助手
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

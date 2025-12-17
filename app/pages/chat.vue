<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { user, clear } = useUserSession()
const toast = useToast()
const router = useRouter()

// 助手状态
const {
  assistants,
  isLoading: isLoadingAssistants,
  currentAssistantId,
  currentAssistant,
  loadAssistants,
  selectAssistant,
  createAssistant,
  updateAssistant,
  deleteAssistant,
} = useAssistants()

// 对话状态
const {
  conversations,
  messages,
  isLoading: isLoadingConversations,
  currentConversationId,
  isStreaming,
  loadConversations,
  selectConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  cleanup,
} = useConversations()

// 模型配置
const { configs: modelConfigs, loadConfigs } = useModelConfigs()

// 助手编辑弹窗
const showAssistantEditor = ref(false)
const editingAssistant = ref<typeof currentAssistant.value>(null)

// 页面加载
onMounted(async () => {
  await Promise.all([
    loadAssistants(),
    loadConfigs(),
  ])
})

// 监听当前助手变化，加载对话列表
watch(currentAssistantId, async (id) => {
  if (id) {
    await loadConversations(id)
  }
}, { immediate: true })

// 选择助手
async function handleSelectAssistant(id: number) {
  selectAssistant(id)
}

// 打开创建助手弹窗
function handleCreateAssistant() {
  editingAssistant.value = null
  showAssistantEditor.value = true
}

// 打开编辑助手弹窗
function handleEditAssistant() {
  editingAssistant.value = currentAssistant.value || null
  showAssistantEditor.value = true
}

// 保存助手
async function handleSaveAssistant(data: any) {
  try {
    if (editingAssistant.value) {
      await updateAssistant(editingAssistant.value.id, data)
      toast.add({ title: '助手已更新', color: 'success' })
    } else {
      const assistant = await createAssistant(data)
      selectAssistant(assistant.id)
      toast.add({ title: '助手已创建', color: 'success' })
    }
    showAssistantEditor.value = false
  } catch (error: any) {
    toast.add({ title: error.message || '操作失败', color: 'error' })
  }
}

// 创建新对话
async function handleCreateConversation() {
  if (!currentAssistantId.value) return

  try {
    await createConversation(currentAssistantId.value)
  } catch (error: any) {
    toast.add({ title: error.message || '创建对话失败', color: 'error' })
  }
}

// 选择对话
async function handleSelectConversation(id: number) {
  await selectConversation(id)
}

// 删除对话
async function handleDeleteConversation(id: number) {
  try {
    await deleteConversation(id)
    toast.add({ title: '对话已删除', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '删除失败', color: 'error' })
  }
}

// 发送消息
async function handleSendMessage(content: string) {
  // 如果没有当前对话，先创建一个
  let conversationId = currentConversationId.value
  if (!conversationId && currentAssistantId.value) {
    try {
      const conversation = await createConversation(currentAssistantId.value, content.slice(0, 20))
      conversationId = conversation.id
    } catch (error: any) {
      toast.add({ title: error.message || '创建对话失败', color: 'error' })
      return
    }
  }

  if (!conversationId) return

  try {
    await sendMessage(conversationId, content)
  } catch (error: any) {
    toast.add({ title: error.message || '发送失败', color: 'error' })
  }
}

// 更新助手模型配置
async function handleUpdateModel(configId: number, modelName: string) {
  if (!currentAssistant.value) return

  try {
    await updateAssistant(currentAssistant.value.id, {
      modelConfigId: configId,
      modelName,
    })
  } catch (error: any) {
    toast.add({ title: error.message || '更新失败', color: 'error' })
  }
}

// 登出
async function handleLogout() {
  cleanup()
  await clear()
  router.push('/login')
}

// 页面卸载时清理
onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) flex flex-col">
    <!-- 顶部导航 -->
    <header class="border-b border-(--ui-border) bg-(--ui-bg-elevated)">
      <div class="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-2">
          <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-(--ui-primary)" />
          <span class="font-bold text-lg">MJ Studio</span>
        </NuxtLink>

        <!-- 右侧操作 -->
        <div class="flex items-center gap-2">
          <NuxtLink to="/">
            <UButton variant="ghost" size="sm">
              <UIcon name="i-heroicons-paint-brush" class="w-4 h-4 mr-1" />
              绘图
            </UButton>
          </NuxtLink>

          <UColorModeButton />

          <NuxtLink to="/settings">
            <UButton variant="ghost" size="sm">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
            </UButton>
          </NuxtLink>

          <UDropdownMenu
            :items="[
              { label: user?.name || user?.email || '用户', disabled: true },
              { type: 'separator' },
              { label: '退出登录', icon: 'i-heroicons-arrow-right-on-rectangle', click: handleLogout }
            ]"
          >
            <UButton variant="ghost" size="sm">
              <UIcon name="i-heroicons-user-circle" class="w-5 h-5" />
            </UButton>
          </UDropdownMenu>
        </div>
      </div>
    </header>

    <!-- 主体内容 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 左侧：助手列表 -->
      <div class="w-[240px] flex-shrink-0">
        <ChatAssistantList
          :assistants="assistants"
          :current-assistant-id="currentAssistantId"
          @select="handleSelectAssistant"
          @create="handleCreateAssistant"
        />
      </div>

      <!-- 中间：消息区域 -->
      <div class="flex-1 flex flex-col min-w-0 border-r border-(--ui-border)">
        <!-- 消息列表 -->
        <ChatMessageList
          :messages="messages"
          :is-streaming="isStreaming"
          class="flex-1"
        />

        <!-- 输入框 -->
        <ChatMessageInput
          :model-configs="modelConfigs"
          :current-config-id="currentAssistant?.modelConfigId || null"
          :current-model-name="currentAssistant?.modelName || null"
          :disabled="isStreaming || !currentAssistant"
          @send="handleSendMessage"
          @update-model="handleUpdateModel"
        />
      </div>

      <!-- 右侧：助手信息 + 对话列表 -->
      <div class="w-[220px] flex-shrink-0 flex flex-col bg-(--ui-bg-elevated)">
        <!-- 助手信息 -->
        <ChatAssistantInfo
          :assistant="currentAssistant"
          @edit="handleEditAssistant"
        />

        <!-- 对话列表 -->
        <ChatConversationList
          :conversations="conversations"
          :current-conversation-id="currentConversationId"
          class="flex-1"
          @select="handleSelectConversation"
          @create="handleCreateConversation"
          @delete="handleDeleteConversation"
        />
      </div>
    </div>

    <!-- 助手编辑弹窗 -->
    <ChatAssistantEditor
      v-model:open="showAssistantEditor"
      :assistant="editingAssistant"
      :model-configs="modelConfigs"
      @save="handleSaveAssistant"
    />
  </div>
</template>

<script setup lang="ts">
import type { Assistant } from '~/composables/useAssistants'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()
const router = useRouter()
const route = useRoute()

// 移动端抽屉状态
const showLeftDrawer = ref(false)
const showRightDrawer = ref(false)

// 助手状态
const {
  assistants,
  isLoading: isLoadingAssistants,
  currentAssistantId,
  currentAssistant,
  getDefaultAssistant,
  loadAssistants,
  selectAssistant,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  togglePinAssistant,
} = useAssistants()

// 对话状态
const {
  conversations,
  messages,
  isLoading: isLoadingConversations,
  currentConversationId,
  currentConversation,
  isStreaming,
  loadConversations,
  selectConversation,
  createConversation,
  startNewConversation,
  deleteConversation,
  updateConversationTitle,
  sendMessage,
  deleteMessage,
  editMessage,
  replayMessage,
  cleanup,
  addManualMessage,
  stopStreaming,
  forkConversation,
  deleteMessagesUntil,
  compressConversation,
  // 输入状态管理
  getInputState,
  updateInputContent,
  updateUploadingFiles,
  updateCompressHint,
  clearInputState,
} = useConversations()

// 当前对话的输入状态
const currentInputState = computed(() => getInputState(currentConversationId.value))

// 上游配置
const { upstreams } = useUpstreams()

// 当前助手的预计首字时长（秒）
const currentEstimatedTime = computed(() => {
  if (!currentAssistant.value?.aimodelId) {
    return null
  }
  for (const upstream of upstreams.value) {
    const aimodel = upstream.aimodels?.find(m => m.id === currentAssistant.value?.aimodelId)
    if (aimodel) {
      return aimodel.estimatedTime ?? null
    }
  }
  return null
})

// 助手编辑弹窗
const showAssistantEditor = ref(false)
const editingAssistant = ref<Assistant | null>(null)

// 消息列表 ref
const messageListRef = ref<{ scrollToCompressRequest: () => void } | null>(null)

// 更新 URL 参数
function updateUrlParams(assistantId: number | null, conversationId: number | null) {
  const query: Record<string, string> = {}
  if (assistantId) query.a = String(assistantId)
  if (conversationId) query.c = String(conversationId)
  router.replace({ query })
}

// 是否已完成初始化（从 URL 恢复或默认初始化）
const initialized = ref(false)

// 初始化页面状态
async function initializePage() {
  // 数据已由插件初始化，这里直接使用即可
  // 如果数据还在加载中，等待加载完成
  while (isLoadingAssistants.value) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  // 从 URL 恢复状态，无参数则使用默认助手
  const assistantIdFromUrl = route.query.a ? Number(route.query.a) : null
  const conversationIdFromUrl = route.query.c ? Number(route.query.c) : null

  // 确定要选中的助手：URL 指定 > 默认助手
  let targetAssistantId = assistantIdFromUrl
  if (!targetAssistantId || !assistants.value.some(a => a.id === targetAssistantId)) {
    const defaultAssistant = getDefaultAssistant()
    targetAssistantId = defaultAssistant?.id || null
  }

  if (targetAssistantId) {
    selectAssistant(targetAssistantId)
    await loadConversations(targetAssistantId)
    // 如果有指定对话，选中它
    if (conversationIdFromUrl && conversations.value.some(c => c.id === conversationIdFromUrl)) {
      await selectConversation(conversationIdFromUrl)
    }
  }

  // 标记初始化完成
  initialized.value = true
}

// 页面加载
onMounted(() => {
  initializePage()
})

// 监听当前助手变化，加载对话列表（仅在初始化完成后生效）
watch(currentAssistantId, async (id, oldId) => {
  // 初始化未完成时跳过
  if (!initialized.value) return
  // 助手实际变化时才加载
  if (id && id !== oldId) {
    await loadConversations(id)
    // 自动选择最新的对话（如果有）
    const latestConversation = conversations.value[0]
    if (latestConversation) {
      await selectConversation(latestConversation.id)
      updateUrlParams(id, latestConversation.id)
    }
  }
})

// 选择助手
async function handleSelectAssistant(id: number) {
  selectAssistant(id)
  showLeftDrawer.value = false
  // URL 更新由 watch 中处理
}

// 打开创建助手弹窗
function handleCreateAssistant() {
  editingAssistant.value = null
  showAssistantEditor.value = true
}

// 收藏/取消收藏助手
async function handlePinAssistant(id: number) {
  try {
    await togglePinAssistant(id)
  } catch (error) {
    toast.add({ title: '操作失败', color: 'error' })
  }
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
      updateUrlParams(assistant.id, null)
      toast.add({ title: '助手已创建', color: 'success' })
    }
    showAssistantEditor.value = false
  } catch (error: any) {
    toast.add({ title: error.message || '操作失败', color: 'error' })
  }
}

// 删除助手
async function handleDeleteAssistant(id: number) {
  try {
    await deleteAssistant(id)
    showAssistantEditor.value = false
    toast.add({ title: '助手已删除', color: 'success' })
    // deleteAssistant 已自动切换到默认助手，更新 URL
    if (currentAssistantId.value) {
      updateUrlParams(currentAssistantId.value, null)
    }
  } catch (error: any) {
    toast.add({ title: error.message || '删除失败', color: 'error' })
  }
}

// 复制助手
async function handleDuplicateAssistant(id: number) {
  try {
    const result = await $fetch<{
      success: boolean
      assistant: { id: number; name: string }
    }>(`/api/assistants/${id}/duplicate`, {
      method: 'POST',
    })
    showAssistantEditor.value = false
    // 刷新助手列表并选中新助手
    await loadAssistants()
    await selectAssistant(result.assistant.id)
    updateUrlParams(result.assistant.id, null)
    toast.add({ title: '助手已复制', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '复制助手失败', color: 'error' })
  }
}

// 创建新对话（进入虚拟对话状态）
function handleCreateConversation() {
  if (!currentAssistantId.value) return
  startNewConversation()
  updateUrlParams(currentAssistantId.value, null)
}

// 选择对话
async function handleSelectConversation(id: number) {
  await selectConversation(id)
  updateUrlParams(currentAssistantId.value, id)
  showRightDrawer.value = false
}

// 删除对话
async function handleDeleteConversation(id: number) {
  // 先获取对话的 assistantId
  const conversation = conversations.value.find(c => c.id === id)
  const assistantId = conversation?.assistantId
  const isCurrentConversation = currentConversationId.value === id

  try {
    await deleteConversation(id)
    toast.add({ title: '对话已删除', color: 'success' })
    // 如果删除的是当前对话，更新 URL
    if (isCurrentConversation) {
      updateUrlParams(currentAssistantId.value, null)
    }
  } catch (error: any) {
    toast.add({ title: error.message || '删除失败', color: 'error' })
  }
}

// 重命名对话
async function handleRenameConversation(id: number, title: string) {
  try {
    await updateConversationTitle(id, title)
    toast.add({ title: '对话已重命名', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '重命名失败', color: 'error' })
  }
}

// AI智能生成对话标题
async function handleGenerateTitle(id: number) {
  try {
    toast.add({ title: '正在生成标题...', color: 'info' })
    const result = await $fetch<{ title: string }>(`/api/conversations/${id}/generate-title`, {
      method: 'POST',
    })
    // 更新本地状态
    const conversation = conversations.value.find(c => c.id === id)
    if (conversation) {
      conversation.title = result.title
    }
    toast.add({ title: '标题已更新', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '生成标题失败', color: 'error' })
  }
}

// 分享对话
async function handleShare(id: number) {
  try {
    const result = await $fetch<{ token: string }>(`/api/conversations/${id}/share`, {
      method: 'POST',
    })
    const shareUrl = `/share/${result.token}`
    window.open(shareUrl, '_blank')
  } catch (error: any) {
    toast.add({ title: error.message || '生成分享链接失败', color: 'error' })
  }
}

// 复制对话
async function handleDuplicateConversation(id: number) {
  try {
    const result = await $fetch<{
      success: boolean
      conversation: { id: number; title: string }
    }>(`/api/conversations/${id}/duplicate`, {
      method: 'POST',
    })
    // 跳转到新对话
    await selectConversation(result.conversation.id)
    updateUrlParams(currentAssistantId.value, result.conversation.id)
    toast.add({ title: '对话已复制', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '复制对话失败', color: 'error' })
  }
}

// 删除消息
async function handleDeleteMessage(id: number) {
  try {
    await deleteMessage(id)
    toast.add({ title: '消息已删除', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '删除失败', color: 'error' })
  }
}

// 重放消息
async function handleReplayMessage(message: any) {
  try {
    await replayMessage(message)
  } catch (error: any) {
    toast.add({ title: error.message || '重放失败', color: 'error' })
  }
}

// 编辑消息
async function handleEditMessage(id: number, content: string) {
  try {
    await editMessage(id, content)
  } catch (error: any) {
    toast.add({ title: error.message || '编辑失败', color: 'error' })
  }
}

// 分叉对话
async function handleForkMessage(messageId: number) {
  try {
    const newConversation = await forkConversation(messageId)
    // 跳转到新对话
    await selectConversation(newConversation.id)
    updateUrlParams(currentAssistantId.value, newConversation.id)
    toast.add({ title: '已创建分叉对话', color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '分叉失败', color: 'error' })
  }
}

// 删除消息及以上
async function handleDeleteUntilMessage(messageId: number) {
  try {
    const count = await deleteMessagesUntil(messageId)
    toast.add({ title: `已删除 ${count} 条消息`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '删除失败', color: 'error' })
  }
}

// 发送消息
async function handleSendMessage(content: string, files?: import('~/shared/types').MessageFile[]) {
  // 如果没有当前对话，先创建一个
  let conversationId = currentConversationId.value
  if (!conversationId && currentAssistantId.value) {
    try {
      // 使用文本内容或第一个文件名作为标题
      const title = content?.slice(0, 20) || files?.[0]?.name?.slice(0, 20) || '新对话'
      const conversation = await createConversation(currentAssistantId.value, title)
      conversationId = conversation.id
      // 更新 URL
      updateUrlParams(currentAssistantId.value, conversationId)
    } catch (error: any) {
      toast.add({ title: error.message || '创建对话失败', color: 'error' })
      return
    }
  }

  if (!conversationId) return

  try {
    await sendMessage(conversationId, content, files)
  } catch (error: any) {
    toast.add({ title: error.message || '发送失败', color: 'error' })
  }
}

// 手动添加消息（不触发AI回复）
async function handleAddMessage(content: string, role: 'user' | 'assistant') {
  // 如果没有当前对话，先创建一个
  let conversationId = currentConversationId.value
  if (!conversationId && currentAssistantId.value) {
    try {
      const conversation = await createConversation(currentAssistantId.value, content.slice(0, 20))
      conversationId = conversation.id
      // 更新 URL
      updateUrlParams(currentAssistantId.value, conversationId)
    } catch (error: any) {
      toast.add({ title: error.message || '创建对话失败', color: 'error' })
      return
    }
  }

  if (!conversationId) return

  try {
    await addManualMessage(conversationId, content, role)
    toast.add({ title: `已添加${role === 'user' ? '用户' : 'AI'}消息`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: error.message || '添加失败', color: 'error' })
  }
}

// 停止AI输出
function handleStop() {
  stopStreaming()
  toast.add({ title: '已停止生成', color: 'info' })
}

// 压缩对话
async function handleCompress() {
  if (!currentConversationId.value) return

  try {
    const stats = await compressConversation(
      currentConversationId.value,
      // 开始回调：跳转到压缩位置
      () => {
        nextTick(() => {
          messageListRef.value?.scrollToCompressRequest()
        })
      }
    )
    if (stats) {
      toast.add({
        title: `已压缩 ${stats.messagesToCompressCount} 条消息`,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({ title: error.message || '压缩失败', color: 'error' })
  }
}

// 更新助手模型配置
async function handleUpdateModel(aimodelId: number) {
  if (!currentAssistant.value) return

  try {
    await updateAssistant(currentAssistant.value.id, {
      aimodelId,
    })
  } catch (error: any) {
    toast.add({ title: error.message || '更新失败', color: 'error' })
  }
}

// 更新助手思考开关
async function handleUpdateThinking(enableThinking: boolean) {
  if (!currentAssistant.value) return

  try {
    await updateAssistant(currentAssistant.value.id, {
      enableThinking,
    })
  } catch (error: any) {
    toast.add({ title: error.message || '更新失败', color: 'error' })
  }
}

// 滚动到压缩请求位置
function handleScrollToCompress() {
  messageListRef.value?.scrollToCompressRequest()
}

// 页面卸载时清理
onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
    <!-- 移动端抽屉按钮栏 -->
    <div class="h-12 flex items-center px-4 border-b border-(--ui-border) bg-(--ui-bg-elevated) flex-shrink-0 lg:hidden">
      <UButton variant="ghost" size="sm" @click="showLeftDrawer = true">
        <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
        <span class="ml-1">助手</span>
      </UButton>
      <span class="flex-1 text-center truncate font-medium text-sm">
        {{ currentConversation?.title || currentAssistant?.name || '选择助手' }}
      </span>
      <UButton variant="ghost" size="sm" @click="showRightDrawer = true">
        <span class="mr-1">对话</span>
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5" />
      </UButton>
    </div>

    <!-- 主体内容 -->
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- 左侧：助手列表（桌面端显示） -->
      <div class="w-[300px] flex-shrink-0 overflow-y-auto border-r border-(--ui-border) hidden lg:block">
        <ChatAssistantList
          :assistants="assistants"
          :current-assistant-id="currentAssistantId"
          @select="handleSelectAssistant"
          @create="handleCreateAssistant"
          @pin="handlePinAssistant"
        />
      </div>

      <!-- 中间：消息区域（始终显示） -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0">
        <!-- 桌面端对话标题栏 -->
        <div v-if="currentConversation" class="h-12 items-center px-4 border-b border-(--ui-border) bg-(--ui-bg-elevated) flex-shrink-0 hidden lg:flex">
          <span class="font-medium truncate">{{ currentConversation.title }}</span>
        </div>

        <!-- 消息列表 -->
        <ChatMessageList
          ref="messageListRef"
          :messages="messages"
          :is-streaming="isStreaming"
          :assistant-id="currentAssistantId"
          :conversation-id="currentConversationId"
          :estimated-time="currentEstimatedTime"
          class="flex-1 min-h-0"
          @delete="handleDeleteMessage"
          @edit="handleEditMessage"
          @fork="handleForkMessage"
          @delete-until="handleDeleteUntilMessage"
          @replay="handleReplayMessage"
          @stop="handleStop"
          @send-suggestion="handleSendMessage"
        />

        <!-- 输入框 -->
        <ChatMessageInput
          :upstreams="upstreams"
          :current-aimodel-id="currentAssistant?.aimodelId || null"
          :disabled="!currentAssistant"
          :is-streaming="isStreaming"
          :messages="messages"
          :system-prompt="currentAssistant?.systemPrompt"
          :content="currentInputState.content"
          :uploading-files="currentInputState.uploadingFiles"
          :show-compress-hint="currentInputState.showCompressHint"
          :enable-thinking="currentAssistant?.enableThinking || false"
          @send="handleSendMessage"
          @add-message="handleAddMessage"
          @stop="handleStop"
          @compress="handleCompress"
          @update-model="handleUpdateModel"
          @scroll-to-compress="handleScrollToCompress"
          @update:content="updateInputContent(currentConversationId, $event)"
          @update:uploading-files="updateUploadingFiles(currentConversationId, $event)"
          @update:show-compress-hint="updateCompressHint(currentConversationId, $event)"
          @update:enable-thinking="handleUpdateThinking"
        />
      </div>

      <!-- 右侧：助手信息 + 对话列表（桌面端显示） -->
      <div class="w-[310px] flex-shrink-0 flex-col overflow-hidden bg-(--ui-bg-elevated) border-l border-(--ui-border) hidden lg:flex">
        <!-- 助手信息 -->
        <ChatAssistantInfo
          :assistant="currentAssistant"
          @edit="handleEditAssistant"
        />

        <!-- 对话列表 -->
        <ChatConversationList
          :conversations="conversations"
          :current-conversation-id="currentConversationId"
          class="flex-1 min-h-0"
          @select="handleSelectConversation"
          @create="handleCreateConversation"
          @delete="handleDeleteConversation"
          @rename="handleRenameConversation"
          @generate-title="handleGenerateTitle"
          @share="handleShare"
          @duplicate="handleDuplicateConversation"
        />
      </div>
    </div>

    <!-- 移动端左侧抽屉（助手列表） -->
    <UDrawer v-model:open="showLeftDrawer" direction="left" title="助手列表" :ui="{ content: 'w-4/5' }">
      <template #body>
        <ChatAssistantList
          :assistants="assistants"
          :current-assistant-id="currentAssistantId"
          class="h-full"
          @select="handleSelectAssistant"
          @create="handleCreateAssistant"
        />
      </template>
    </UDrawer>

    <!-- 移动端右侧抽屉（助手信息 + 对话列表） -->
    <UDrawer v-model:open="showRightDrawer" direction="right" title="对话" :ui="{ content: 'w-4/5' }">
      <template #body>
        <div class="flex flex-col h-full">
          <!-- 助手信息 -->
          <ChatAssistantInfo
            :assistant="currentAssistant"
            @edit="handleEditAssistant"
          />
          <!-- 对话列表 -->
          <ChatConversationList
            :conversations="conversations"
            :current-conversation-id="currentConversationId"
            class="flex-1 min-h-0"
            @select="handleSelectConversation"
            @create="handleCreateConversation"
            @delete="handleDeleteConversation"
            @rename="handleRenameConversation"
            @generate-title="handleGenerateTitle"
            @share="handleShare"
            @duplicate="handleDuplicateConversation"
          />
        </div>
      </template>
    </UDrawer>

    <!-- 助手编辑弹窗 -->
    <ChatAssistantEditor
      v-model:open="showAssistantEditor"
      :assistant="editingAssistant"
      :upstreams="upstreams"
      @save="handleSaveAssistant"
      @delete="handleDeleteAssistant"
      @duplicate="handleDuplicateAssistant"
    />
  </div>
</template>

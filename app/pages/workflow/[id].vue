<script setup lang="ts">
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, Connection } from '@vue-flow/core'
import type { WorkflowData } from '~/shared/workflow-types'

definePageMeta({
  layout: false,
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const workflowId = computed(() => Number(route.params.id))

// 工作流数据
const workflowInfo = ref<{
  id: number
  name: string
  description?: string
  workflow: WorkflowData
} | null>(null)
const isLoading = ref(true)

const workflowData = computed(() => workflowInfo.value?.workflow)

// 加载工作流数据
async function loadWorkflow() {
  isLoading.value = true
  try {
    const res = await $fetch<{
      success: boolean
      data: {
        id: number
        name: string
        description?: string
        workflow: WorkflowData
      }
    }>(`/api/workflows/${workflowId.value}`)
    workflowInfo.value = res.data
  } catch (error: any) {
    toast.add({ title: '工作流加载失败', description: error.data?.message, color: 'error' })
    router.push('/workflows')
  } finally {
    isLoading.value = false
  }
}


// 节点和边
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

const { project, fitView, getViewport } = useVueFlow()

// 初始化数据
watch(workflowData, (data) => {
  if (data) {
    nodes.value = data.nodes.map(n => ({
      ...n,
      data: { ...n.data },
    })) as Node[]
    edges.value = data.edges.map(e => ({
      ...e,
      animated: true,
      style: { stroke: '#60a5fa' },
    })) as Edge[]
    // 数据加载后自适应视图
    nextTick(() => {
      setTimeout(() => fitView({ padding: 0.2 }), 100)
    })
  }
}, { immediate: true })

// 保存状态
const isSaving = ref(false)
const hasChanges = ref(false)

// 自动保存
const autoSave = ref(false)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// 标题编辑
const isEditingTitle = ref(false)
const editingTitle = ref('')

function startEditTitle() {
  if (!workflowInfo.value) return
  editingTitle.value = workflowInfo.value.name
  isEditingTitle.value = true
  nextTick(() => {
    const input = document.querySelector('.title-input') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function confirmEditTitle() {
  if (!workflowInfo.value || !editingTitle.value.trim()) {
    isEditingTitle.value = false
    return
  }
  workflowInfo.value.name = editingTitle.value.trim()
  isEditingTitle.value = false
  hasChanges.value = true
}

function cancelEditTitle() {
  isEditingTitle.value = false
}

// 标记有变更
watch([nodes, edges], () => {
  hasChanges.value = true
  // 自动保存逻辑
  if (autoSave.value && !isSaving.value) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      saveWorkflow()
    }, 2000) // 2秒防抖
  }
}, { deep: true })

// 保存工作流
async function saveWorkflow() {
  if (!workflowInfo.value) return

  isSaving.value = true
  try {
    const viewport = getViewport()
    const data: WorkflowData = {
      version: '1.0.0',
      name: workflowInfo.value.name,
      description: workflowInfo.value.description,
      nodes: nodes.value.map(n => ({
        id: n.id,
        type: n.type as any,
        position: n.position,
        data: n.data,
      })),
      edges: edges.value.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      },
    }

    await $fetch(`/api/workflows/${workflowId.value}`, {
      method: 'PUT',
      body: { data },
    })

    hasChanges.value = false
    toast.add({ title: '已保存', color: 'success' })
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error.data?.message, color: 'error' })
  } finally {
    isSaving.value = false
  }
}

// 连接处理
function onConnect(connection: Connection) {
  const edge: Edge = {
    id: `e-${Date.now()}`,
    source: connection.source!,
    target: connection.target!,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    animated: true,
    style: { stroke: '#60a5fa' },
  }
  edges.value.push(edge)
}

// 右键菜单状态
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  worldX: 0,
  worldY: 0,
})

// 节点类型选项
const nodeTypeOptions = [
  { type: 'input-image', label: '图片输入', icon: 'i-heroicons-photo' },
  { type: 'gen-image', label: 'AI 图像生成', icon: 'i-heroicons-sparkles' },
  { type: 'gen-video', label: 'AI 视频生成', icon: 'i-heroicons-film' },
  { type: 'text-node', label: '文本节点', icon: 'i-heroicons-document-text' },
  { type: 'preview', label: '预览节点', icon: 'i-heroicons-eye' },
]

// 画布右键菜单
function onPaneContextMenu(event: MouseEvent) {
  event.preventDefault()
  const worldPos = project({ x: event.clientX, y: event.clientY })
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    worldX: worldPos.x,
    worldY: worldPos.y,
  }
}

// 添加节点
function addNode(type: string) {
  const id = `${type}-${Date.now()}`
  const labels: Record<string, string> = {
    'input-image': '图片输入',
    'gen-image': 'AI 图像生成',
    'gen-video': 'AI 视频生成',
    'text-node': '提示词',
    'preview': '预览',
  }

  nodes.value.push({
    id,
    type,
    position: { x: contextMenu.value.worldX - 100, y: contextMenu.value.worldY - 50 },
    data: { label: labels[type] || type },
  })

  contextMenu.value.show = false
}

// 关闭右键菜单
function closeContextMenu() {
  contextMenu.value.show = false
}

// 返回列表
function goBack() {
  if (hasChanges.value) {
    if (confirm('有未保存的更改，确定要离开吗？')) {
      router.push('/workflows')
    }
  } else {
    router.push('/workflows')
  }
}

// 快捷键保存
function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    saveWorkflow()
  }
}

onMounted(() => {
  loadWorkflow()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="workflow-page h-screen w-screen bg-zinc-950 overflow-hidden" @click="closeContextMenu">
    <!-- 顶部工具栏 -->
    <header class="absolute top-0 left-0 right-0 z-10 h-12 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 flex items-center px-4 gap-4">
      <UButton variant="ghost" size="sm" @click="goBack">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
        返回
      </UButton>

      <div class="h-4 w-px bg-zinc-700" />

      <!-- 标题（可编辑） -->
      <div class="flex items-center gap-1">
        <template v-if="isEditingTitle">
          <input
            v-model="editingTitle"
            class="title-input bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-zinc-200 outline-none focus:border-blue-500 w-48"
            @keydown.enter="confirmEditTitle"
            @keydown.escape="cancelEditTitle"
            @blur="confirmEditTitle"
          />
        </template>
        <template v-else>
          <h1
            class="text-sm font-medium text-zinc-200 cursor-pointer hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
            title="点击编辑标题"
            @click="startEditTitle"
          >
            {{ workflowInfo?.name || '工作流' }}
          </h1>
        </template>
        <span v-if="hasChanges" class="text-yellow-500 text-sm">*</span>
      </div>

      <div class="flex-1" />

      <!-- 自动保存 -->
      <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
        <input
          v-model="autoSave"
          type="checkbox"
          class="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
        自动保存
      </label>

      <div class="h-4 w-px bg-zinc-700" />

      <span class="text-xs text-zinc-500 hidden sm:inline">Ctrl+S 保存 · 右键添加节点</span>

      <UButton
        size="sm"
        color="primary"
        :loading="isSaving"
        :disabled="!hasChanges"
        @click="saveWorkflow"
      >
        <UIcon name="i-heroicons-cloud-arrow-up" class="w-4 h-4 mr-1" />
        保存
      </UButton>
    </header>

    <!-- 加载中 -->
    <div v-if="isLoading" class="absolute inset-0 pt-12 flex items-center justify-center">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-zinc-500" />
    </div>

    <!-- Vue Flow 画布 -->
    <ClientOnly v-else>
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="workflowData?.viewport || { x: 0, y: 0, zoom: 1 }"
        :min-zoom="0.2"
        :max-zoom="3"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        :delete-key-code="['Backspace', 'Delete']"
        class="workflow-canvas"
        @connect="onConnect"
        @pane-context-menu="onPaneContextMenu"
        @pane-click="closeContextMenu"
      >
        <!-- 背景 -->
        <Background :gap="20" :size="1" pattern-color="#27272a" />

        <!-- 小地图 -->
        <MiniMap :pannable="true" :zoomable="true" class="!bg-zinc-900 !border-zinc-700" />

        <!-- 控制面板 -->
        <Controls :show-fit-view="true" :show-interactive="true" class="!bg-zinc-900 !border-zinc-700" />

        <!-- 自定义节点: 图片输入 -->
        <template #node-input-image="{ data }">
          <div class="workflow-node node-input">
            <div class="node-header">
              <UIcon name="i-heroicons-photo" class="w-4 h-4" />
              <span>{{ data.label }}</span>
            </div>
            <div class="node-content">
              <div class="upload-area">
                <UIcon name="i-heroicons-arrow-up-tray" class="w-8 h-8 text-zinc-500" />
                <span class="text-xs text-zinc-500">点击上传图片</span>
              </div>
            </div>
            <Handle type="source" :position="Position.Right" class="handle-source" />
          </div>
        </template>

        <!-- 自定义节点: AI 图像生成 -->
        <template #node-gen-image="{ data }">
          <div class="workflow-node node-gen">
            <div class="node-header node-header-gen">
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
              <span>{{ data.label }}</span>
            </div>
            <div class="node-content">
              <div class="mb-2">
                <label class="text-[10px] text-zinc-500 block mb-1">模型</label>
                <select class="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
                  <option>Midjourney</option>
                  <option>DALL-E</option>
                  <option>Flux</option>
                </select>
              </div>
              <div>
                <label class="text-[10px] text-zinc-500 block mb-1">提示词</label>
                <textarea
                  class="w-full h-16 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 resize-none nodrag"
                  placeholder="输入提示词..."
                />
              </div>
              <UButton size="xs" color="primary" class="w-full mt-2">
                <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                生成
              </UButton>
            </div>
            <Handle type="target" :position="Position.Left" class="handle-target" />
            <Handle type="source" :position="Position.Right" class="handle-source" />
          </div>
        </template>

        <!-- 自定义节点: AI 视频生成 -->
        <template #node-gen-video="{ data }">
          <div class="workflow-node node-video">
            <div class="node-header node-header-video">
              <UIcon name="i-heroicons-film" class="w-4 h-4" />
              <span>{{ data.label }}</span>
            </div>
            <div class="node-content">
              <div class="mb-2">
                <label class="text-[10px] text-zinc-500 block mb-1">模型</label>
                <select class="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
                  <option>即梦视频</option>
                  <option>Veo</option>
                  <option>Sora</option>
                </select>
              </div>
              <div>
                <label class="text-[10px] text-zinc-500 block mb-1">提示词</label>
                <textarea
                  class="w-full h-16 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 resize-none nodrag"
                  placeholder="输入视频描述..."
                />
              </div>
              <UButton size="xs" color="secondary" class="w-full mt-2">
                <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                生成视频
              </UButton>
            </div>
            <Handle type="target" :position="Position.Left" class="handle-target" />
            <Handle type="source" :position="Position.Right" class="handle-source" />
          </div>
        </template>

        <!-- 自定义节点: 文本 -->
        <template #node-text-node="{ data }">
          <div class="workflow-node node-text">
            <div class="node-header node-header-text">
              <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
              <span>{{ data.label }}</span>
            </div>
            <div class="node-content">
              <textarea
                v-model="data.text"
                class="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 resize-none nodrag"
                placeholder="输入文本内容..."
              />
            </div>
            <Handle type="source" :position="Position.Right" class="handle-source" />
          </div>
        </template>

        <!-- 自定义节点: 预览 -->
        <template #node-preview="{ data }">
          <div class="workflow-node node-preview">
            <div class="node-header node-header-preview">
              <UIcon name="i-heroicons-eye" class="w-4 h-4" />
              <span>{{ data.label }}</span>
            </div>
            <div class="node-content">
              <div class="preview-area">
                <UIcon name="i-heroicons-photo" class="w-12 h-12 text-zinc-600" />
                <span class="text-xs text-zinc-500">等待输入</span>
              </div>
            </div>
            <Handle type="target" :position="Position.Left" class="handle-target" />
          </div>
        </template>
      </VueFlow>

      <template #fallback>
        <div class="h-full w-full flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </template>
    </ClientOnly>

    <!-- 右键上下文菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @click.stop
      >
        <div class="context-menu-header">添加节点</div>
        <button
          v-for="opt in nodeTypeOptions"
          :key="opt.type"
          class="context-menu-item"
          @click="addNode(opt.type)"
        >
          <UIcon :name="opt.icon" class="w-4 h-4" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.workflow-canvas {
  width: 100%;
  height: 100%;
  padding-top: 48px;
}

/* 节点基础样式 */
.workflow-node {
  min-width: 220px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  position: relative;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #3f3f46;
  font-size: 12px;
  font-weight: 500;
  color: #e4e4e7;
}

.node-header-gen {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.1), transparent);
  border-color: rgba(59, 130, 246, 0.3);
}

.node-header-video {
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.1), transparent);
  border-color: rgba(168, 85, 247, 0.3);
}

.node-header-text {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.1), transparent);
  border-color: rgba(34, 197, 94, 0.3);
}

.node-header-preview {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.1), transparent);
  border-color: rgba(251, 191, 36, 0.3);
}

.node-content {
  padding: 12px;
}

.upload-area,
.preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100px;
  border: 2px dashed #3f3f46;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-area:hover,
.preview-area:hover {
  border-color: #60a5fa;
}

/* Handle 样式 */
.handle-source,
.handle-target {
  width: 12px !important;
  height: 12px !important;
  background: #3f3f46 !important;
  border: 2px solid #52525b !important;
  transition: background 0.15s, border-color 0.15s !important;
}

.handle-source:hover,
.handle-target:hover {
  background: #60a5fa !important;
  border-color: #60a5fa !important;
}

.handle-source {
  right: -6px !important;
}

.handle-target {
  left: -6px !important;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.context-menu-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  color: #71717a;
  border-bottom: 1px solid #3f3f46;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  color: #e4e4e7;
  text-align: left;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: #27272a;
}

/* Vue Flow 主题覆盖 */
:deep(.vue-flow__node) {
  padding: 0;
  border-radius: 8px;
  border: none;
  background: transparent;
}

:deep(.vue-flow__node.selected) {
  box-shadow: 0 0 0 2px #60a5fa;
}

:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: #3f3f46;
  border: 2px solid #52525b;
  transition: background 0.15s, border-color 0.15s;
}

:deep(.vue-flow__handle:hover) {
  background: #60a5fa;
  border-color: #60a5fa;
}

:deep(.vue-flow__edge-path) {
  stroke-width: 2;
}

:deep(.vue-flow__controls) {
  background: #18181b;
  border-color: #3f3f46;
}

:deep(.vue-flow__controls-button) {
  background: #18181b;
  border-color: #3f3f46;
  color: #a1a1aa;
}

:deep(.vue-flow__controls-button:hover) {
  background: #27272a;
}

:deep(.vue-flow__minimap) {
  background: #18181b;
  border-color: #3f3f46;
}

:deep(.vue-flow__connection-path) {
  stroke: #60a5fa;
  stroke-width: 2;
}
</style>

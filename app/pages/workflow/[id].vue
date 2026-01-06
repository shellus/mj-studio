<script setup lang="ts">
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, Connection } from '@vue-flow/core'
import type { WorkflowData } from '~/shared/workflow-types'
import type { WorkflowRun } from '~/server/database/schema'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// 上游配置（用于模型选择）
const { upstreams } = useUpstreams()

// 工作流执行
const {
  nodeStates,
  isExecuting,
  getNodeState,
  executeSingleNode,
  cleanup: cleanupExecution,
} = useWorkflowExecution()


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

// 运行历史
const runs = ref<WorkflowRun[]>([])

async function loadRuns() {
  try {
    const res = await $fetch<{ success: boolean; data: WorkflowRun[] }>(
      `/api/workflows/${workflowId.value}/runs`
    )
    runs.value = res.data || []
  } catch (error) {
    // 如果 API 还没实现，忽略错误
    runs.value = []
  }
}

// 侧边栏状态
const sidebarCollapsed = ref(false)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

// 选择运行记录
function handleSelectRun(runId: number) {
  router.push(`/workflow-run/${runId}`)
}

// 开始运行工作流
async function handleRun() {
  if (!workflowInfo.value) return

  // 如果有未保存的更改，先保存
  if (hasChanges.value) {
    await saveWorkflow()
  }

  try {
    const res = await $fetch<{ success: boolean; runId: number }>(
      `/api/workflows/${workflowId.value}/run`,
      { method: 'POST' }
    )
    // 跳转到运行模式页面
    router.push(`/workflow-run/${res.runId}`)
  } catch (error: any) {
    toast.add({ title: '运行失败', description: error.data?.message, color: 'error' })
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

// 快捷键保存
function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    saveWorkflow()
  }
}

// 更新节点的模型选择
function updateNodeModel(nodeId: string, field: 'upstreamId' | 'aimodelId', value: number | null) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    node.data[field] = value
  }
}

// 执行单个节点
async function executeNode(nodeId: string) {
  try {
    await executeSingleNode(workflowId.value, nodeId)
  } catch (error: any) {
    toast.add({
      title: '执行失败',
      description: error.message,
      color: 'error',
    })
  }
}

// 获取节点状态类名
function getNodeStatusClass(nodeId: string): string {
  const state = getNodeState(nodeId)
  if (!state) return ''
  switch (state.status) {
    case 'pending':
    case 'processing':
      return 'node-processing'
    case 'success':
      return 'node-success'
    case 'failed':
      return 'node-failed'
    default:
      return ''
  }
}

// 获取上游节点的结果（用于预览节点）
function getUpstreamResult(nodeId: string): { type: 'image' | 'video'; url: string } | null {
  // 找到连接到此节点的边
  const incomingEdges = edges.value.filter(e => e.target === nodeId)

  for (const edge of incomingEdges) {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    if (!sourceNode) continue

    // 从输入图片节点获取
    if (sourceNode.type === 'input-image' && sourceNode.data.imageUrl) {
      return { type: 'image', url: sourceNode.data.imageUrl }
    }

    // 从生成节点获取结果
    if (sourceNode.type === 'gen-image') {
      const state = nodeStates.value.get(sourceNode.id)
      if (state?.resultUrl) {
        return { type: 'image', url: state.resultUrl }
      }
    }

    if (sourceNode.type === 'gen-video') {
      const state = nodeStates.value.get(sourceNode.id)
      if (state?.resultUrl) {
        return { type: 'video', url: state.resultUrl }
      }
    }
  }

  return null
}

// 图片上传
const fileInput = ref<HTMLInputElement | null>(null)
const uploadingNodeId = ref<string | null>(null)

function triggerUpload(nodeId: string) {
  uploadingNodeId.value = nodeId
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !uploadingNodeId.value) return

  const formData = new FormData()
  formData.append('file', file)

  try {
    const result = await $fetch<{ success: boolean; url: string }>('/api/images/upload', {
      method: 'POST',
      body: formData,
    })

    if (result.success) {
      const node = nodes.value.find(n => n.id === uploadingNodeId.value)
      if (node) {
        node.data.imageUrl = result.url
      }
    }
  } catch (error: any) {
    toast.add({
      title: '上传失败',
      description: error.message,
      color: 'error',
    })
  } finally {
    uploadingNodeId.value = null
    input.value = ''
  }
}

onMounted(() => {
  loadWorkflow()
  loadRuns()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  cleanupExecution()
})
</script>

<template>
  <div class="workflow-page flex h-[calc(100vh-56px)] bg-(--ui-bg) overflow-hidden" @click="closeContextMenu">
    <!-- 隐藏的文件上传 -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileUpload"
    />

    <!-- 左侧边栏 -->
    <WorkflowSidebar
      :workflow-name="workflowInfo?.name || '工作流'"
      :runs="runs"
      :has-changes="hasChanges"
      :is-saving="isSaving"
      :is-collapsed="sidebarCollapsed"
      @run="handleRun"
      @save="saveWorkflow"
      @select-run="handleSelectRun"
      @toggle-collapse="toggleSidebar"
    />

    <!-- 主画布区域 -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- 加载中 -->
      <div v-if="isLoading" class="flex-1 flex items-center justify-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-(--ui-text-muted)" />
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
          <Background :gap="20" :size="1" class="workflow-background" />

          <!-- 小地图 -->
          <MiniMap :pannable="true" :zoomable="true" />

          <!-- 控制面板 -->
          <Controls :show-fit-view="true" :show-interactive="true" />

          <!-- 自定义节点: 图片输入 -->
          <template #node-input-image="{ id, data }">
            <div class="workflow-node node-input">
              <div class="node-header">
                <UIcon name="i-heroicons-photo" class="w-4 h-4" />
                <span>{{ data.label }}</span>
              </div>
              <div class="node-content">
                <div
                  v-if="data.imageUrl"
                  class="upload-area has-image"
                  @click="triggerUpload(id)"
                >
                  <img :src="data.imageUrl" class="w-full h-full object-cover rounded" />
                </div>
                <div v-else class="upload-area" @click="triggerUpload(id)">
                  <UIcon name="i-heroicons-arrow-up-tray" class="w-8 h-8 text-(--ui-text-muted)" />
                  <span class="text-xs text-(--ui-text-muted)">点击上传图片</span>
                </div>
              </div>
              <Handle type="source" :position="Position.Right" class="handle-source" />
            </div>
          </template>

          <!-- 自定义节点: AI 图像生成 -->
          <template #node-gen-image="{ id, data }">
            <div class="workflow-node node-gen" :class="getNodeStatusClass(id)">
              <div class="node-header node-header-gen">
                <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
                <span>{{ data.label }}</span>
                <!-- 状态指示 -->
                <span v-if="getNodeState(id)?.status === 'processing'" class="ml-auto">
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-blue-400" />
                </span>
                <span v-else-if="getNodeState(id)?.status === 'success'" class="ml-auto">
                  <UIcon name="i-heroicons-check-circle" class="w-3 h-3 text-green-400" />
                </span>
                <span v-else-if="getNodeState(id)?.status === 'failed'" class="ml-auto">
                  <UIcon name="i-heroicons-x-circle" class="w-3 h-3 text-red-400" />
                </span>
              </div>
              <div class="node-content">
                <div class="mb-2 nodrag">
                  <ModelSelector
                    :upstreams="upstreams"
                    category="image"
                    list-layout
                    dropdown-width="w-64"
                    :upstream-id="data.upstreamId || null"
                    :aimodel-id="data.aimodelId || null"
                    @update:upstream-id="(val) => updateNodeModel(id, 'upstreamId', val)"
                    @update:aimodel-id="(val) => updateNodeModel(id, 'aimodelId', val)"
                  />
                </div>
                <div>
                  <label class="text-[10px] text-(--ui-text-muted) block mb-1">提示词</label>
                  <textarea
                    v-model="data.prompt"
                    class="node-textarea nodrag"
                    placeholder="输入提示词..."
                  />
                </div>
                <!-- 执行结果预览 -->
                <div v-if="getNodeState(id)?.resultUrl" class="mt-2">
                  <img :src="getNodeState(id)?.resultUrl" class="w-full h-24 object-cover rounded" />
                </div>
                <!-- 错误信息 -->
                <div v-if="getNodeState(id)?.error" class="mt-2 text-[10px] text-red-400 truncate" :title="getNodeState(id)?.error">
                  {{ getNodeState(id)?.error }}
                </div>
                <UButton
                  size="xs"
                  color="primary"
                  class="w-full mt-2"
                  :loading="getNodeState(id)?.status === 'processing'"
                  :disabled="!data.upstreamId || getNodeState(id)?.status === 'processing'"
                  @click="executeNode(id)"
                >
                  <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                  {{ getNodeState(id)?.status === 'processing' ? '生成中...' : '生成' }}
                </UButton>
              </div>
              <Handle type="target" :position="Position.Left" class="handle-target" />
              <Handle type="source" :position="Position.Right" class="handle-source" />
            </div>
          </template>

          <!-- 自定义节点: AI 视频生成 -->
          <template #node-gen-video="{ id, data }">
            <div class="workflow-node node-video" :class="getNodeStatusClass(id)">
              <div class="node-header node-header-video">
                <UIcon name="i-heroicons-film" class="w-4 h-4" />
                <span>{{ data.label }}</span>
                <!-- 状态指示 -->
                <span v-if="getNodeState(id)?.status === 'processing'" class="ml-auto">
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-purple-400" />
                </span>
                <span v-else-if="getNodeState(id)?.status === 'success'" class="ml-auto">
                  <UIcon name="i-heroicons-check-circle" class="w-3 h-3 text-green-400" />
                </span>
                <span v-else-if="getNodeState(id)?.status === 'failed'" class="ml-auto">
                  <UIcon name="i-heroicons-x-circle" class="w-3 h-3 text-red-400" />
                </span>
              </div>
              <div class="node-content">
                <div class="mb-2 nodrag">
                  <ModelSelector
                    :upstreams="upstreams"
                    category="video"
                    list-layout
                    dropdown-width="w-64"
                    :upstream-id="data.upstreamId || null"
                    :aimodel-id="data.aimodelId || null"
                    @update:upstream-id="(val) => updateNodeModel(id, 'upstreamId', val)"
                    @update:aimodel-id="(val) => updateNodeModel(id, 'aimodelId', val)"
                  />
                </div>
                <div>
                  <label class="text-[10px] text-(--ui-text-muted) block mb-1">提示词</label>
                  <textarea
                    v-model="data.prompt"
                    class="node-textarea nodrag"
                    placeholder="输入视频描述..."
                  />
                </div>
                <!-- 执行结果预览 -->
                <div v-if="getNodeState(id)?.resultUrl" class="mt-2">
                  <video :src="getNodeState(id)?.resultUrl" class="w-full h-24 object-cover rounded" controls />
                </div>
                <!-- 错误信息 -->
                <div v-if="getNodeState(id)?.error" class="mt-2 text-[10px] text-red-400 truncate" :title="getNodeState(id)?.error">
                  {{ getNodeState(id)?.error }}
                </div>
                <UButton
                  size="xs"
                  color="secondary"
                  class="w-full mt-2"
                  :loading="getNodeState(id)?.status === 'processing'"
                  :disabled="!data.upstreamId || getNodeState(id)?.status === 'processing'"
                  @click="executeNode(id)"
                >
                  <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                  {{ getNodeState(id)?.status === 'processing' ? '生成中...' : '生成视频' }}
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
                  class="node-textarea h-20 nodrag"
                  placeholder="输入文本内容..."
                />
              </div>
              <Handle type="source" :position="Position.Right" class="handle-source" />
            </div>
          </template>

          <!-- 自定义节点: 预览 -->
          <template #node-preview="{ id, data }">
            <div class="workflow-node node-preview">
              <div class="node-header node-header-preview">
                <UIcon name="i-heroicons-eye" class="w-4 h-4" />
                <span>{{ data.label }}</span>
              </div>
              <div class="node-content">
                <!-- 显示上游结果 -->
                <template v-if="getUpstreamResult(id)">
                  <img
                    v-if="getUpstreamResult(id)?.type === 'image'"
                    :src="getUpstreamResult(id)?.url"
                    class="w-full h-32 object-contain rounded bg-(--ui-bg-muted)"
                  />
                  <video
                    v-else-if="getUpstreamResult(id)?.type === 'video'"
                    :src="getUpstreamResult(id)?.url"
                    class="w-full h-32 object-contain rounded bg-(--ui-bg-muted)"
                    controls
                  />
                </template>
                <div v-else class="preview-area">
                  <UIcon name="i-heroicons-photo" class="w-12 h-12 text-(--ui-text-dimmed)" />
                  <span class="text-xs text-(--ui-text-muted)">等待输入</span>
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
    </div>

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
  flex: 1;
  width: 100%;
  height: 100%;
}

/* 节点基础样式 */
.workflow-node {
  min-width: 220px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  position: relative;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text);
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

/* 节点表单控件 */
.node-textarea {
  width: 100%;
  height: 64px;
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  color: var(--ui-text);
  resize: none;
}

.node-textarea:focus {
  outline: none;
  border-color: var(--ui-primary);
}

.upload-area,
.preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100px;
  border: 2px dashed var(--ui-border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-area:hover,
.preview-area:hover {
  border-color: var(--ui-primary);
}

.upload-area.has-image {
  border: none;
  padding: 0;
}

/* 节点状态样式 */
.node-processing {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
}

.node-success {
  border-color: #22c55e !important;
}

.node-failed {
  border-color: #ef4444 !important;
}

/* Handle 样式 */
.handle-source,
.handle-target {
  width: 12px !important;
  height: 12px !important;
  background: var(--ui-bg-accented) !important;
  border: 2px solid var(--ui-border) !important;
  transition: background 0.15s, border-color 0.15s !important;
}

.handle-source:hover,
.handle-target:hover {
  background: var(--ui-primary) !important;
  border-color: var(--ui-primary) !important;
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
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.context-menu-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ui-text-dimmed);
  border-bottom: 1px solid var(--ui-border);
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--ui-text);
  text-align: left;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: var(--ui-bg-accented);
}

/* Vue Flow 主题覆盖 */
:deep(.vue-flow__node) {
  padding: 0;
  border-radius: 8px;
  border: none;
  background: transparent;
}

:deep(.vue-flow__node.selected) {
  box-shadow: 0 0 0 2px var(--ui-primary);
}

:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: var(--ui-bg-accented);
  border: 2px solid var(--ui-border);
  transition: background 0.15s, border-color 0.15s;
}

:deep(.vue-flow__handle:hover) {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
}

:deep(.vue-flow__edge-path) {
  stroke-width: 2;
}

:deep(.vue-flow__controls) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-border);
}

:deep(.vue-flow__controls-button) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-border);
  color: var(--ui-text-muted);
}

:deep(.vue-flow__controls-button:hover) {
  background: var(--ui-bg-accented);
}

:deep(.vue-flow__minimap) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-border);
}

:deep(.vue-flow__connection-path) {
  stroke: var(--ui-primary);
  stroke-width: 2;
}

/* Background 背景网格 */
:deep(.vue-flow__background) {
  background-color: var(--ui-bg);
}

:deep(.vue-flow__background pattern circle),
:deep(.vue-flow__background pattern line) {
  stroke: var(--ui-border);
}
</style>

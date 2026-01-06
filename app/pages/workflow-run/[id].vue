<script setup lang="ts">
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import type { WorkflowData } from '~/shared/workflow-types'
import type { WorkflowRun, WorkflowRunNode, WorkflowRunMode, WorkflowRunStatus, WorkflowRunNodeStatus } from '~/server/database/schema'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// 认证
const { getAuthHeader } = useAuth()

// 上游配置（用于模型显示）
const { upstreams } = useUpstreams()

const runId = computed(() => Number(route.params.id))

// Run 数据
const run = ref<WorkflowRun | null>(null)
const runNodes = ref<Map<string, WorkflowRunNode>>(new Map())
const workflowSnapshot = ref<WorkflowData | null>(null)
const isLoading = ref(true)

// 节点和边（只读）
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

const { fitView } = useVueFlow()

// 加载 Run 数据
async function loadRun() {
  isLoading.value = true
  try {
    const res = await $fetch<{
      success: boolean
      data: {
        run: WorkflowRun
        nodes: WorkflowRunNode[]
        snapshot: WorkflowData
      }
    }>(`/api/workflow-runs/${runId.value}`)

    run.value = res.data.run
    workflowSnapshot.value = res.data.snapshot

    // 构建节点状态 Map
    runNodes.value = new Map(res.data.nodes.map(n => [n.nodeId, n]))

    // 初始化画布节点和边
    initCanvas()
  } catch (error: any) {
    toast.add({ title: '加载运行记录失败', description: error.data?.message, color: 'error' })
    router.push('/workflows')
  } finally {
    isLoading.value = false
  }
}

// 初始化画布
function initCanvas() {
  if (!workflowSnapshot.value) return

  nodes.value = workflowSnapshot.value.nodes.map(n => ({
    ...n,
    data: { ...n.data },
    draggable: false, // 只读模式
    selectable: true,
  })) as Node[]

  edges.value = workflowSnapshot.value.edges.map(e => ({
    ...e,
    animated: true,
    style: { stroke: '#60a5fa' },
  })) as Edge[]

  nextTick(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  })
}

// 获取节点状态
function getNodeRunState(nodeId: string): WorkflowRunNode | undefined {
  return runNodes.value.get(nodeId)
}

// 获取节点状态类名
function getNodeStatusClass(nodeId: string): string {
  const state = getNodeRunState(nodeId)
  if (!state) return ''
  switch (state.status) {
    case 'pending':
    case 'processing':
      return 'node-processing'
    case 'success':
      return 'node-success'
    case 'failed':
      return 'node-failed'
    case 'skipped':
      return 'node-skipped'
    default:
      return ''
  }
}

// 获取上游节点的结果（用于预览节点）
function getUpstreamResult(nodeId: string): { type: 'image' | 'video'; url: string } | null {
  const incomingEdges = edges.value.filter(e => e.target === nodeId)

  for (const edge of incomingEdges) {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    if (!sourceNode) continue

    // 从输入图片节点获取
    if (sourceNode.type === 'input-image' && sourceNode.data.imageUrl) {
      return { type: 'image', url: sourceNode.data.imageUrl }
    }

    // 从生成节点获取结果
    const state = getNodeRunState(sourceNode.id)
    if (state?.outputs?.resourceUrl) {
      if (sourceNode.type === 'gen-image') {
        return { type: 'image', url: state.outputs.resourceUrl }
      }
      if (sourceNode.type === 'gen-video') {
        return { type: 'video', url: state.outputs.resourceUrl }
      }
    }
  }

  return null
}

// 运行模式选项
const runModeOptions = [
  { value: 'normal', label: '普通模式', description: '自动执行所有节点' },
  { value: 'step', label: '单步模式', description: '每个节点执行后暂停' },
]

// 切换运行模式
async function changeRunMode(mode: WorkflowRunMode) {
  if (!run.value || run.value.runMode === mode) return

  try {
    await $fetch(`/api/workflow-runs/${runId.value}`, {
      method: 'PATCH',
      body: { runMode: mode },
    })
    run.value.runMode = mode
    toast.add({ title: `已切换到${mode === 'normal' ? '普通' : '单步'}模式`, color: 'success' })
  } catch (error: any) {
    toast.add({ title: '切换模式失败', description: error.data?.message, color: 'error' })
  }
}

// 执行单个节点
async function executeNode(nodeId: string) {
  try {
    await $fetch(`/api/workflow-runs/${runId.value}/execute-node`, {
      method: 'POST',
      body: { nodeId },
    })
    toast.add({ title: '节点执行中', color: 'info' })
  } catch (error: any) {
    toast.add({ title: '执行失败', description: error.data?.message, color: 'error' })
  }
}

// 继续执行
async function continueRun() {
  try {
    await $fetch(`/api/workflow-runs/${runId.value}/continue`, {
      method: 'POST',
    })
    toast.add({ title: '继续执行中', color: 'info' })
  } catch (error: any) {
    toast.add({ title: '继续执行失败', description: error.data?.message, color: 'error' })
  }
}

// 重试整个 Run
async function retryRun() {
  try {
    await $fetch(`/api/workflow-runs/${runId.value}/retry`, {
      method: 'POST',
    })
    toast.add({ title: '重新执行中', color: 'info' })
  } catch (error: any) {
    toast.add({ title: '重试失败', description: error.data?.message, color: 'error' })
  }
}

// 取消执行
async function cancelRun() {
  try {
    await $fetch(`/api/workflow-runs/${runId.value}/cancel`, {
      method: 'POST',
    })
    toast.add({ title: '已取消执行', color: 'warning' })
  } catch (error: any) {
    toast.add({ title: '取消失败', description: error.data?.message, color: 'error' })
  }
}

// 返回编辑模式
function goToEdit() {
  if (run.value?.workflowId) {
    router.push(`/workflow/${run.value.workflowId}`)
  }
}

// 状态显示
const statusLabels: Record<WorkflowRunStatus, string> = {
  pending: '等待中',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const statusColors: Record<WorkflowRunStatus, string> = {
  pending: 'text-(--ui-text-muted)',
  running: 'text-blue-500',
  paused: 'text-yellow-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-500',
}

const statusIcons: Record<WorkflowRunStatus, string> = {
  pending: 'i-heroicons-clock',
  running: 'i-heroicons-arrow-path',
  paused: 'i-heroicons-pause-circle',
  completed: 'i-heroicons-check-circle',
  failed: 'i-heroicons-x-circle',
  cancelled: 'i-heroicons-stop-circle',
}

// 可用操作判断
const canContinue = computed(() => run.value?.status === 'paused')
const canCancel = computed(() => run.value?.status === 'running')
const canRetry = computed(() => ['failed', 'cancelled', 'completed'].includes(run.value?.status || ''))
const canExecuteNode = computed(() => ['paused', 'failed', 'cancelled', 'completed'].includes(run.value?.status || ''))

// SSE 订阅（使用 fetch 方式，与对话模块保持一致）
let abortController: AbortController | null = null

async function subscribeSSE() {
  // 清理之前的连接
  if (abortController) {
    abortController.abort()
  }

  abortController = new AbortController()

  try {
    const response = await fetch(`/api/workflow-runs/${runId.value}/events`, {
      signal: abortController.signal,
      headers: getAuthHeader(),
    })

    if (!response.ok) {
      throw new Error('订阅失败')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取响应')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 处理 SSE 格式
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        try {
          const parsed = JSON.parse(data)
          handleSSEEvent(parsed)
        } catch {
          // JSON 解析错误则忽略
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // 用户主动取消，忽略
      return
    }
    console.error('SSE 订阅错误:', error)
    // 连接断开，5秒后重连
    setTimeout(() => {
      if (run.value?.status === 'running' || run.value?.status === 'pending') {
        subscribeSSE()
      }
    }, 5000)
  }
}

function handleSSEEvent(data: any) {
  switch (data.type) {
    case 'run_status':
      if (run.value) {
        run.value.status = data.status
      }
      break

    case 'run_mode_changed':
      if (run.value) {
        run.value.runMode = data.runMode
      }
      break

    case 'run_node_status': {
      const existing = runNodes.value.get(data.nodeId)
      if (existing) {
        existing.status = data.status
        if (data.outputs) existing.outputs = data.outputs
        if (data.error) existing.error = data.error
      } else {
        runNodes.value.set(data.nodeId, {
          id: 0,
          runId: runId.value,
          nodeId: data.nodeId,
          status: data.status,
          outputs: data.outputs,
          error: data.error,
          inputs: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
        })
      }
      break
    }

    case 'run_node_progress':
      // 可以扩展显示进度
      break
  }
}

function cleanupSSE() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

onMounted(() => {
  loadRun()
})

// 当 run 加载完成后，如果状态是 pending 或 running，订阅 SSE
watch(() => run.value?.status, (status, oldStatus) => {
  if (status === 'running' || status === 'pending') {
    subscribeSSE()
  } else if (oldStatus === 'running' || oldStatus === 'pending') {
    // 从 running/pending 变为其他状态时，保持连接一小段时间以接收最后的事件
    setTimeout(() => {
      if (run.value?.status !== 'running' && run.value?.status !== 'pending') {
        cleanupSSE()
      }
    }, 2000)
  }
}, { immediate: true })

onUnmounted(() => {
  cleanupSSE()
})
</script>

<template>
  <div class="workflow-run-page flex flex-col h-[calc(100vh-56px)] bg-(--ui-bg) overflow-hidden">
    <!-- 顶部工具栏 -->
    <div class="toolbar flex items-center gap-3 px-4 py-2 border-b border-(--ui-border) bg-(--ui-bg-elevated)">
      <!-- 返回编辑 -->
      <UButton variant="ghost" size="sm" @click="goToEdit">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
        返回编辑
      </UButton>

      <div class="h-4 w-px bg-(--ui-border)" />

      <!-- 执行操作 -->
      <UButton
        v-if="canExecuteNode"
        variant="outline"
        size="sm"
        @click="continueRun"
        :disabled="!canContinue"
      >
        <UIcon name="i-heroicons-play" class="w-4 h-4 mr-1" />
        继续运行
      </UButton>

      <UButton
        v-if="canCancel"
        variant="outline"
        size="sm"
        color="warning"
        @click="cancelRun"
      >
        <UIcon name="i-heroicons-stop" class="w-4 h-4 mr-1" />
        中止
      </UButton>

      <UButton
        v-if="canRetry"
        variant="outline"
        size="sm"
        @click="retryRun"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
        重试
      </UButton>

      <div class="flex-1" />

      <!-- 运行模式选择器 -->
      <UDropdownMenu
        :items="runModeOptions.map(opt => ({
          label: opt.label,
          click: () => changeRunMode(opt.value as WorkflowRunMode),
          active: run?.runMode === opt.value,
        }))"
      >
        <UButton variant="ghost" size="sm">
          {{ run?.runMode === 'step' ? '单步模式' : '普通模式' }}
          <UIcon name="i-heroicons-chevron-down" class="w-4 h-4 ml-1" />
        </UButton>
      </UDropdownMenu>

      <div class="h-4 w-px bg-(--ui-border)" />

      <!-- Run 状态 -->
      <div class="flex items-center gap-2 text-sm">
        <span class="text-(--ui-text-muted)">Run #{{ run?.id }}</span>
        <UIcon
          v-if="run"
          :name="statusIcons[run.status]"
          class="w-4 h-4"
          :class="[statusColors[run.status], run.status === 'running' && 'animate-spin']"
        />
        <span v-if="run" :class="statusColors[run.status]">
          {{ statusLabels[run.status] }}
        </span>
      </div>
    </div>

    <!-- 主画布区域 -->
    <div class="flex-1 flex min-h-0">
      <!-- 加载中 -->
      <div v-if="isLoading" class="flex-1 flex items-center justify-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-(--ui-text-muted)" />
      </div>

      <!-- Vue Flow 画布（只读） -->
      <ClientOnly v-else>
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :default-viewport="workflowSnapshot?.viewport || { x: 0, y: 0, zoom: 1 }"
          :min-zoom="0.2"
          :max-zoom="3"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :edges-updatable="false"
          class="workflow-canvas"
        >
          <!-- 背景 -->
          <Background :gap="20" :size="1" class="workflow-background" />

          <!-- 小地图 -->
          <MiniMap :pannable="true" :zoomable="true" />

          <!-- 控制面板 -->
          <Controls :show-fit-view="true" :show-interactive="false" />

          <!-- 自定义节点: 图片输入 -->
          <template #node-input-image="{ id, data }">
            <div class="workflow-node node-input" :class="getNodeStatusClass(id)">
              <div class="node-header">
                <UIcon name="i-heroicons-photo" class="w-4 h-4" />
                <span>{{ data.label }}</span>
              </div>
              <div class="node-content">
                <div v-if="data.imageUrl" class="preview-image">
                  <img :src="data.imageUrl" class="w-full h-full object-cover rounded" />
                </div>
                <div v-else class="preview-area">
                  <UIcon name="i-heroicons-photo" class="w-8 h-8 text-(--ui-text-dimmed)" />
                  <span class="text-xs text-(--ui-text-muted)">无图片</span>
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
                <span v-if="getNodeRunState(id)?.status === 'processing'" class="ml-auto">
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-blue-400" />
                </span>
                <span v-else-if="getNodeRunState(id)?.status === 'success'" class="ml-auto">
                  <UIcon name="i-heroicons-check-circle" class="w-3 h-3 text-green-400" />
                </span>
                <span v-else-if="getNodeRunState(id)?.status === 'failed'" class="ml-auto">
                  <UIcon name="i-heroicons-x-circle" class="w-3 h-3 text-red-400" />
                </span>
              </div>
              <div class="node-content">
                <!-- 模型信息（只读显示） -->
                <div class="text-xs text-(--ui-text-muted) mb-2">
                  模型: {{ data.aimodelId ? `#${data.aimodelId}` : '未选择' }}
                </div>
                <!-- 提示词（只读） -->
                <div class="text-xs mb-2">
                  <span class="text-(--ui-text-muted)">提示词:</span>
                  <p class="mt-1 text-(--ui-text) line-clamp-2">{{ data.prompt || '无' }}</p>
                </div>
                <!-- 执行结果预览 -->
                <div v-if="getNodeRunState(id)?.outputs?.resourceUrl" class="mt-2">
                  <img :src="getNodeRunState(id)?.outputs?.resourceUrl" class="w-full h-24 object-cover rounded" />
                </div>
                <!-- 错误信息 -->
                <div v-if="getNodeRunState(id)?.error" class="mt-2 text-[10px] text-red-400 truncate" :title="getNodeRunState(id)?.error || ''">
                  {{ getNodeRunState(id)?.error }}
                </div>
                <!-- 执行按钮 -->
                <UButton
                  v-if="canExecuteNode"
                  size="xs"
                  color="primary"
                  class="w-full mt-2"
                  :loading="getNodeRunState(id)?.status === 'processing'"
                  :disabled="getNodeRunState(id)?.status === 'processing'"
                  @click="executeNode(id)"
                >
                  <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                  {{ getNodeRunState(id)?.status === 'processing' ? '生成中...' : '执行' }}
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
                <span v-if="getNodeRunState(id)?.status === 'processing'" class="ml-auto">
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-purple-400" />
                </span>
                <span v-else-if="getNodeRunState(id)?.status === 'success'" class="ml-auto">
                  <UIcon name="i-heroicons-check-circle" class="w-3 h-3 text-green-400" />
                </span>
                <span v-else-if="getNodeRunState(id)?.status === 'failed'" class="ml-auto">
                  <UIcon name="i-heroicons-x-circle" class="w-3 h-3 text-red-400" />
                </span>
              </div>
              <div class="node-content">
                <!-- 模型信息（只读显示） -->
                <div class="text-xs text-(--ui-text-muted) mb-2">
                  模型: {{ data.aimodelId ? `#${data.aimodelId}` : '未选择' }}
                </div>
                <!-- 提示词（只读） -->
                <div class="text-xs mb-2">
                  <span class="text-(--ui-text-muted)">提示词:</span>
                  <p class="mt-1 text-(--ui-text) line-clamp-2">{{ data.prompt || '无' }}</p>
                </div>
                <!-- 执行结果预览 -->
                <div v-if="getNodeRunState(id)?.outputs?.resourceUrl" class="mt-2">
                  <video :src="getNodeRunState(id)?.outputs?.resourceUrl" class="w-full h-24 object-cover rounded" controls />
                </div>
                <!-- 错误信息 -->
                <div v-if="getNodeRunState(id)?.error" class="mt-2 text-[10px] text-red-400 truncate" :title="getNodeRunState(id)?.error || ''">
                  {{ getNodeRunState(id)?.error }}
                </div>
                <!-- 执行按钮 -->
                <UButton
                  v-if="canExecuteNode"
                  size="xs"
                  color="secondary"
                  class="w-full mt-2"
                  :loading="getNodeRunState(id)?.status === 'processing'"
                  :disabled="getNodeRunState(id)?.status === 'processing'"
                  @click="executeNode(id)"
                >
                  <UIcon name="i-heroicons-play" class="w-3 h-3 mr-1" />
                  {{ getNodeRunState(id)?.status === 'processing' ? '生成中...' : '执行' }}
                </UButton>
              </div>
              <Handle type="target" :position="Position.Left" class="handle-target" />
              <Handle type="source" :position="Position.Right" class="handle-source" />
            </div>
          </template>

          <!-- 自定义节点: 文本 -->
          <template #node-text-node="{ id, data }">
            <div class="workflow-node node-text" :class="getNodeStatusClass(id)">
              <div class="node-header node-header-text">
                <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                <span>{{ data.label }}</span>
              </div>
              <div class="node-content">
                <p class="text-xs text-(--ui-text) line-clamp-4">{{ data.text || '无内容' }}</p>
              </div>
              <Handle type="source" :position="Position.Right" class="handle-source" />
            </div>
          </template>

          <!-- 自定义节点: 预览 -->
          <template #node-preview="{ id, data }">
            <div class="workflow-node node-preview" :class="getNodeStatusClass(id)">
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

.preview-image,
.preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100px;
  border: 2px dashed var(--ui-border);
  border-radius: 6px;
}

.preview-image {
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

.node-skipped {
  opacity: 0.5;
  border-color: var(--ui-border) !important;
}

/* Handle 样式 */
.handle-source,
.handle-target {
  width: 12px !important;
  height: 12px !important;
  background: var(--ui-bg-accented) !important;
  border: 2px solid var(--ui-border) !important;
}

.handle-source {
  right: -6px !important;
}

.handle-target {
  left: -6px !important;
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

/* Background 背景网格 */
:deep(.vue-flow__background) {
  background-color: var(--ui-bg);
}

:deep(.vue-flow__background pattern circle),
:deep(.vue-flow__background pattern line) {
  stroke: var(--ui-border);
}
</style>

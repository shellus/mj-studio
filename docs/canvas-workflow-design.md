# 画布工作流编排系统设计文档

> 基于 Tapnow Studio 项目分析，适配 Vue Flow + Nuxt 技术栈

---

## 目录

1. [项目背景与技术选型](#1-项目背景与技术选型)
2. [核心概念与数据模型](#2-核心概念与数据模型)
3. [Vue Flow 集成方案](#3-vue-flow-集成方案)
4. [节点系统设计](#4-节点系统设计)
5. [连接线与数据流](#5-连接线与数据流)
6. [状态管理方案](#6-状态管理方案)
7. [持久化与导入导出](#7-持久化与导入导出)
8. [性能优化策略](#8-性能优化策略)
9. [项目结构参考](#9-项目结构参考)
10. [实施路线图](#10-实施路线图)

---

## 1. 项目背景与技术选型

### 1.1 原项目分析 (Tapnow Studio)

Tapnow Studio 是一个单文件（21000+ 行）的可视化 AI 工作流工具，其画布编排功能**完全自主实现**：

| 功能模块 | 实现方式 | 代码行数（估算） |
|---------|---------|----------------|
| 画布平移/缩放 | CSS transform + 鼠标事件 | ~200 行 |
| 节点拖拽/调整大小 | 原生 DOM 事件 | ~300 行 |
| 连接线绘制 | SVG 贝塞尔曲线 | ~250 行 |
| 框选多选 | 屏幕坐标 → 世界坐标转换 | ~150 行 |
| 节点连接逻辑 | 自定义状态管理 | ~200 行 |
| 性能优化 | requestAnimationFrame 节流 | ~200 行 |

**维护痛点**：
- 无撤销/重做功能
- 无小地图/自动布局
- 边缘情况处理不完善（极端缩放、触控设备）
- 新增节点类型需手动处理渲染逻辑

### 1.2 技术选型对比

| 库 | Stars | Vue 支持 | 功能完整度 | 学习成本 | 推荐度 |
|---|-------|---------|-----------|---------|-------|
| **Vue Flow** | 4k+ | Vue 3 原生 | ⭐⭐⭐⭐⭐ | 低 | ✅ 首选 |
| Drawflow | 4.5k+ | Vue 2/3 | ⭐⭐⭐ | 最低 | 轻量场景 |
| Rete.js | 10k+ | 插件支持 | ⭐⭐⭐⭐⭐ | 高 | 复杂数据流 |
| Litegraph.js | 6k+ | 需封装 | ⭐⭐⭐⭐ | 高 | 高性能 |

### 1.3 最终选型

```
前端框架: Nuxt 3 (Vue 3 + SSR/SSG)
画布引擎: Vue Flow (@vue-flow/core)
状态管理: Pinia
持久化: localStorage + IndexedDB (大文件)
样式: Tailwind CSS / UnoCSS
```

---

## 2. 核心概念与数据模型

### 2.1 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                        Canvas (画布)                         │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │  Node A  │────▶│  Node B  │────▶│  Node C  │            │
│  │ (输入)   │     │ (处理)   │     │ (输出)   │            │
│  └──────────┘     └──────────┘     └──────────┘            │
│       │                                                     │
│       └─────────Edge (连接线/边)────────▶                   │
│                                                             │
│  View: { x, y, zoom }  (视口状态)                           │
└─────────────────────────────────────────────────────────────┘
```

**术语对照**：

| Tapnow Studio | Vue Flow | 说明 |
|---------------|----------|------|
| node | node | 节点 |
| connection | edge | 连接线/边 |
| view | viewport | 视口状态 |
| from/to | source/target | 连接起点/终点 |
| content | data | 节点数据 |

### 2.2 节点数据模型

#### 原 Tapnow Studio 结构

```typescript
// 原始结构（React）
interface TapnowNode {
  id: string;           // `node-${Date.now()}`
  type: string;         // 'input-image' | 'gen-image' | 'video-analyze' | ...
  x: number;            // 世界坐标 X
  y: number;            // 世界坐标 Y
  width: number;        // 节点宽度
  height: number;       // 节点高度
  content?: string;     // 媒体内容 (base64/URL)
  dimensions?: { w: number; h: number };  // 原始媒体尺寸
  settings: Record<string, any>;          // 节点特定配置
  // 可选字段
  maskContent?: string;       // 蒙版数据
  selectedKeyframes?: Frame[];  // 视频关键帧
  frames?: Frame[];           // 抽帧结果
}

interface TapnowConnection {
  id: string;           // `conn-${Date.now()}`
  from: string;         // 源节点 ID
  to: string;           // 目标节点 ID
  inputType?: 'default' | 'oref' | 'sref';  // Midjourney 特有
}
```

#### Vue Flow 适配结构

```typescript
// types/workflow.ts

import type { Node, Edge } from '@vue-flow/core';

// 节点类型枚举
export enum NodeType {
  INPUT_IMAGE = 'input-image',
  INPUT_VIDEO = 'video-input',
  GEN_IMAGE = 'gen-image',
  GEN_VIDEO = 'gen-video',
  VIDEO_ANALYZE = 'video-analyze',
  PREVIEW = 'preview',
  TEXT_NODE = 'text-node',
  IMAGE_COMPARE = 'image-compare',
  LOCAL_SAVE = 'local-save',
  // 扩展节点类型...
}

// 节点通用数据接口
export interface BaseNodeData {
  label?: string;
  status?: 'idle' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
}

// 输入节点数据
export interface InputImageNodeData extends BaseNodeData {
  content?: string;  // base64 或 URL
  dimensions?: { w: number; h: number };
  maskContent?: string;
}

// 生成节点数据
export interface GenImageNodeData extends BaseNodeData {
  model: string;
  prompt: string;
  ratio: string;
  resolution: string;
  // Midjourney 特有
  orefWeight?: number;
  srefWeight?: number;
}

// 视频分析节点数据
export interface VideoAnalyzeNodeData extends BaseNodeData {
  model: string;
  segmentDuration: number;
  analysisMode: 'auto' | 'manual';
  frames?: Array<{ time: number; url: string }>;
  analysisResults?: any[];
}

// 统一节点类型
export type WorkflowNode = Node<
  InputImageNodeData | GenImageNodeData | VideoAnalyzeNodeData | BaseNodeData
>;

// Handle 类型（连接点）
export enum HandleType {
  DEFAULT = 'default',
  OREF = 'oref',      // Midjourney 角色一致性
  SREF = 'sref',      // Midjourney 风格一致性
}

// 边数据
export interface WorkflowEdgeData {
  handleType?: HandleType;
}

export type WorkflowEdge = Edge<WorkflowEdgeData>;

// 工作流完整结构
export interface Workflow {
  version: string;
  projectName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: { x: number; y: number; zoom: number };
  metadata?: {
    createdAt: string;
    updatedAt: string;
  };
}
```

### 2.3 节点类型清单

基于原项目分析，需实现以下节点类型：

| 类型 | 说明 | 输入 | 输出 | 默认尺寸 |
|-----|------|-----|------|---------|
| `input-image` | 图片输入 | 无 | image | 260×260 |
| `video-input` | 视频输入 | 无 | video | 360×420 |
| `gen-image` | AI 图像生成 | image(可选) | image | 360×340 |
| `gen-video` | AI 视频生成 | image(可选) | video | 320×420 |
| `video-analyze` | 视频分析 | video | frames/text | 400×500 |
| `preview` | 预览节点 | image/video | 无 | 320×260 |
| `text-node` | 文本节点 | 无 | text | 280×200 |
| `image-compare` | 图像对比 | image×2 | 无 | 400×300 |
| `local-save` | 本地保存 | image/video | 无 | 320×380 |

---

## 3. Vue Flow 集成方案

### 3.1 安装依赖

```bash
# 核心包
pnpm add @vue-flow/core

# 可选增强包
pnpm add @vue-flow/background    # 背景网格
pnpm add @vue-flow/controls      # 缩放控制
pnpm add @vue-flow/minimap       # 小地图
pnpm add @vue-flow/node-resizer  # 节点调整大小
```

### 3.2 Nuxt 模块配置

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@pinia/nuxt',
  ],

  // Vue Flow 需要客户端渲染
  ssr: false,  // 或使用 <ClientOnly> 包裹

  css: [
    '@vue-flow/core/dist/style.css',
    '@vue-flow/core/dist/theme-default.css',
  ],

  // 可选：自定义主题
  // '@vue-flow/minimap/dist/style.css',
  // '@vue-flow/controls/dist/style.css',
})
```

### 3.3 基础画布组件

```vue
<!-- components/workflow/WorkflowCanvas.vue -->
<template>
  <div class="workflow-canvas h-full w-full">
    <ClientOnly>
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :node-types="nodeTypes"
        :default-viewport="{ x: 0, y: 0, zoom: 1 }"
        :min-zoom="0.2"
        :max-zoom="3"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        :connection-mode="ConnectionMode.Loose"
        :delete-key-code="['Backspace', 'Delete']"
        :selection-key-code="['Shift']"
        :multi-selection-key-code="['Meta', 'Control']"
        fit-view-on-init
        @connect="onConnect"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
        @node-drag-stop="onNodeDragStop"
        @pane-click="onPaneClick"
        @pane-context-menu="onPaneContextMenu"
      >
        <!-- 背景 -->
        <Background :variant="BackgroundVariant.Dots" :gap="20" />

        <!-- 小地图 -->
        <MiniMap
          :node-stroke-width="3"
          :pannable="true"
          :zoomable="true"
        />

        <!-- 控制面板 -->
        <Controls :show-fit-view="true" :show-interactive="true" />

        <!-- 连接线样式 -->
        <template #edge-custom="props">
          <BezierEdge v-bind="props" :style="{ stroke: '#a1a1aa' }" />
        </template>
      </VueFlow>

      <!-- 上下文菜单 -->
      <ContextMenu
        v-if="contextMenu.visible"
        :x="contextMenu.x"
        :y="contextMenu.y"
        @add-node="handleAddNode"
        @close="contextMenu.visible = false"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { VueFlow, useVueFlow, ConnectionMode, BackgroundVariant } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { BezierEdge } from '@vue-flow/core';

import type { Connection, NodeChange, EdgeChange } from '@vue-flow/core';
import type { WorkflowNode, WorkflowEdge } from '~/types/workflow';

// 自定义节点组件映射
const nodeTypes = {
  'input-image': resolveComponent('NodeInputImage'),
  'video-input': resolveComponent('NodeVideoInput'),
  'gen-image': resolveComponent('NodeGenImage'),
  'gen-video': resolveComponent('NodeGenVideo'),
  'video-analyze': resolveComponent('NodeVideoAnalyze'),
  'preview': resolveComponent('NodePreview'),
  'text-node': resolveComponent('NodeText'),
  'image-compare': resolveComponent('NodeImageCompare'),
  'local-save': resolveComponent('NodeLocalSave'),
};

// 使用 Pinia Store
const workflowStore = useWorkflowStore();
const { nodes, edges } = storeToRefs(workflowStore);

// Vue Flow 实例
const {
  project,           // 屏幕坐标转世界坐标
  fitView,           // 适应视图
  getNodes,
  getEdges,
  addNodes,
  addEdges,
  removeNodes,
  removeEdges,
  onConnect: vfOnConnect,
} = useVueFlow();

// 上下文菜单状态
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  worldX: 0,
  worldY: 0,
});

// 连接事件
function onConnect(connection: Connection) {
  // 验证连接有效性
  if (!isValidConnection(connection)) return;

  const edge: WorkflowEdge = {
    id: `edge-${Date.now()}`,
    source: connection.source!,
    target: connection.target!,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: 'bezier',
    animated: true,
  };

  workflowStore.addEdge(edge);
}

// 节点变化
function onNodesChange(changes: NodeChange[]) {
  workflowStore.applyNodeChanges(changes);
}

// 边变化
function onEdgesChange(changes: EdgeChange[]) {
  workflowStore.applyEdgeChanges(changes);
}

// 节点拖拽结束
function onNodeDragStop(event: MouseEvent, node: WorkflowNode) {
  // 可选：保存位置变化到历史记录（撤销/重做）
  workflowStore.recordChange('node-move', { nodeId: node.id });
}

// 画布点击
function onPaneClick() {
  contextMenu.value.visible = false;
  workflowStore.clearSelection();
}

// 右键菜单
function onPaneContextMenu(event: MouseEvent) {
  event.preventDefault();
  const worldPos = project({ x: event.clientX, y: event.clientY });

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    worldX: worldPos.x,
    worldY: worldPos.y,
  };
}

// 添加节点
function handleAddNode(type: string) {
  const newNode = workflowStore.createNode(
    type,
    contextMenu.value.worldX,
    contextMenu.value.worldY
  );
  contextMenu.value.visible = false;
}

// 连接验证
function isValidConnection(connection: Connection): boolean {
  // 防止自连接
  if (connection.source === connection.target) return false;

  // 防止重复连接
  const exists = edges.value.some(
    e => e.source === connection.source && e.target === connection.target
  );
  if (exists) return false;

  // TODO: 可添加类型兼容性检查
  return true;
}
</script>

<style>
.workflow-canvas {
  background-color: #09090b;
}

/* 自定义 Vue Flow 主题 */
.vue-flow__node {
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.vue-flow__edge-path {
  stroke-dasharray: 4 4;
  animation: dash 0.5s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -8;
  }
}
</style>
```

---

## 4. 节点系统设计

### 4.1 节点基础组件

```vue
<!-- components/workflow/nodes/NodeBase.vue -->
<template>
  <div
    class="node-base"
    :class="[
      `node-${type}`,
      { 'node-selected': selected },
      { 'node-processing': data.status === 'processing' },
    ]"
    :style="{ width: `${width}px`, minHeight: `${height}px` }"
  >
    <!-- 节点头部 -->
    <div class="node-header">
      <div class="node-title">
        <component :is="icon" class="w-4 h-4" />
        <span>{{ title }}</span>
      </div>
      <div v-if="data.status === 'processing'" class="node-timer">
        {{ formatTime(elapsedTime) }}
      </div>
    </div>

    <!-- 节点内容插槽 -->
    <div class="node-content">
      <slot />
    </div>

    <!-- 进度条 -->
    <div v-if="data.progress" class="node-progress">
      <div
        class="node-progress-bar"
        :style="{ width: `${data.progress}%` }"
      />
    </div>

    <!-- 输入 Handle -->
    <Handle
      v-for="handle in inputHandles"
      :key="handle.id"
      type="target"
      :id="handle.id"
      :position="Position.Left"
      :style="{ top: handle.top }"
      class="node-handle node-handle-input"
    />

    <!-- 输出 Handle -->
    <Handle
      v-for="handle in outputHandles"
      :key="handle.id"
      type="source"
      :id="handle.id"
      :position="Position.Right"
      :style="{ top: handle.top }"
      class="node-handle node-handle-output"
    />

    <!-- 调整大小手柄 -->
    <NodeResizer
      v-if="resizable"
      :min-width="200"
      :min-height="150"
    />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { NodeResizer } from '@vue-flow/node-resizer';

interface Props {
  id: string;
  type: string;
  data: Record<string, any>;
  selected?: boolean;
  width?: number;
  height?: number;
  title?: string;
  icon?: Component;
  resizable?: boolean;
  inputHandles?: Array<{ id: string; top: string }>;
  outputHandles?: Array<{ id: string; top: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  width: 260,
  height: 260,
  resizable: true,
  inputHandles: () => [{ id: 'default', top: '50%' }],
  outputHandles: () => [{ id: 'default', top: '50%' }],
});

// 计时器逻辑
const elapsedTime = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

watch(() => props.data.status, (status) => {
  if (status === 'processing') {
    elapsedTime.value = 0;
    timer = setInterval(() => elapsedTime.value++, 1000);
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.node-base {
  @apply bg-zinc-900 border border-zinc-700 rounded-lg p-3;
  @apply transition-all duration-200;
}

.node-selected {
  @apply border-blue-500 ring-2 ring-blue-500/30;
}

.node-processing {
  @apply border-yellow-500/50;
}

.node-header {
  @apply flex items-center justify-between mb-2;
}

.node-title {
  @apply flex items-center gap-2 text-xs text-zinc-300 font-medium;
}

.node-timer {
  @apply text-[10px] font-mono text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded;
}

.node-progress {
  @apply h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden;
}

.node-progress-bar {
  @apply h-full bg-blue-500 transition-all duration-300;
}

.node-handle {
  @apply w-3 h-3 border-2 border-zinc-600 bg-zinc-800;
  @apply transition-colors duration-200;
}

.node-handle:hover {
  @apply border-blue-500 bg-blue-500;
}

.node-handle-input {
  @apply -left-1.5;
}

.node-handle-output {
  @apply -right-1.5;
}
</style>
```

### 4.2 具体节点实现示例

```vue
<!-- components/workflow/nodes/NodeGenImage.vue -->
<template>
  <NodeBase
    v-bind="nodeProps"
    :title="modelConfig?.provider || 'AI 图像生成'"
    :icon="Wand2"
    :width="360"
    :height="340"
    :input-handles="inputHandles"
    :output-handles="[{ id: 'default', top: '50%' }]"
  >
    <!-- 引用图片预览 -->
    <div v-if="connectedImages.length" class="ref-images mb-2">
      <div class="text-[10px] text-zinc-500 mb-1">引用图片</div>
      <div class="flex gap-1 flex-wrap">
        <img
          v-for="(img, idx) in connectedImages.slice(0, 4)"
          :key="idx"
          :src="img"
          class="w-10 h-10 object-cover rounded"
        />
        <span v-if="connectedImages.length > 4" class="text-xs text-zinc-500">
          +{{ connectedImages.length - 4 }}
        </span>
      </div>
    </div>

    <!-- 提示词输入 -->
    <div class="prompt-area mb-2">
      <textarea
        v-model="localPrompt"
        placeholder="输入提示词..."
        class="w-full h-24 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 resize-none"
        @blur="updatePrompt"
      />
    </div>

    <!-- 模型选择 -->
    <div class="flex gap-2 mb-2">
      <select
        v-model="localModel"
        class="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
        @change="updateModel"
      >
        <option v-for="model in imageModels" :key="model.id" :value="model.id">
          {{ model.provider }}
        </option>
      </select>
    </div>

    <!-- Midjourney 特有选项 -->
    <div v-if="isMidjourney" class="mj-options space-y-1.5">
      <div class="flex items-center gap-2 text-[10px] text-zinc-400">
        <Handle
          type="target"
          id="oref"
          :position="Position.Left"
          class="node-handle -ml-4"
        />
        <span>--oref 角色一致性</span>
        <input
          v-model.number="orefWeight"
          type="number"
          min="0"
          max="100"
          class="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 text-center"
        />
      </div>
      <div class="flex items-center gap-2 text-[10px] text-zinc-400">
        <Handle
          type="target"
          id="sref"
          :position="Position.Left"
          class="node-handle -ml-4"
        />
        <span>--sref 风格一致性</span>
        <input
          v-model.number="srefWeight"
          type="number"
          min="0"
          max="100"
          class="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 text-center"
        />
      </div>
    </div>

    <!-- 生成按钮 -->
    <button
      class="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded transition-colors"
      :disabled="isProcessing"
      @click="handleGenerate"
    >
      <template v-if="isProcessing">
        <Loader2 class="w-4 h-4 animate-spin inline mr-1" />
        生成中...
      </template>
      <template v-else>
        生成图像
      </template>
    </button>

    <!-- 结果预览 -->
    <div v-if="resultImage" class="result-preview mt-2">
      <img :src="resultImage" class="w-full rounded" />
    </div>
  </NodeBase>
</template>

<script setup lang="ts">
import { Handle, Position, useNode } from '@vue-flow/core';
import { Wand2, Loader2 } from 'lucide-vue-next';
import NodeBase from './NodeBase.vue';

const props = defineProps<{
  id: string;
  data: GenImageNodeData;
  selected?: boolean;
}>();

const { node } = useNode();
const workflowStore = useWorkflowStore();
const apiStore = useApiStore();

// 节点传递属性
const nodeProps = computed(() => ({
  id: props.id,
  type: 'gen-image',
  data: props.data,
  selected: props.selected,
}));

// 本地状态
const localPrompt = ref(props.data.prompt || '');
const localModel = ref(props.data.model || 'nano-banana');
const orefWeight = ref(props.data.orefWeight || 100);
const srefWeight = ref(props.data.srefWeight || 100);

// 计算属性
const imageModels = computed(() => apiStore.getModelsByType('Image'));
const modelConfig = computed(() => apiStore.getModelById(localModel.value));
const isMidjourney = computed(() =>
  localModel.value.includes('mj') ||
  modelConfig.value?.provider?.toLowerCase().includes('midjourney')
);

const isProcessing = computed(() => props.data.status === 'processing');
const resultImage = computed(() => props.data.resultUrl);

// 连接的输入图片
const connectedImages = computed(() =>
  workflowStore.getConnectedInputImages(props.id)
);

// 动态 Handle
const inputHandles = computed(() => {
  const handles = [{ id: 'default', top: '50%' }];
  // Midjourney 额外 handle 在模板中单独处理
  return handles;
});

// 更新节点数据
function updatePrompt() {
  workflowStore.updateNodeData(props.id, { prompt: localPrompt.value });
}

function updateModel() {
  workflowStore.updateNodeData(props.id, { model: localModel.value });
}

// 生成图像
async function handleGenerate() {
  workflowStore.updateNodeData(props.id, { status: 'processing', progress: 0 });

  try {
    const result = await apiStore.generateImage({
      model: localModel.value,
      prompt: localPrompt.value,
      referenceImages: connectedImages.value,
      oref: isMidjourney.value ? orefWeight.value : undefined,
      sref: isMidjourney.value ? srefWeight.value : undefined,
    });

    workflowStore.updateNodeData(props.id, {
      status: 'completed',
      progress: 100,
      resultUrl: result.url,
    });

    // 添加到历史记录
    workflowStore.addHistoryItem({
      type: 'image',
      url: result.url,
      sourceNodeId: props.id,
      model: localModel.value,
      prompt: localPrompt.value,
    });
  } catch (error) {
    workflowStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message,
    });
  }
}
</script>
```

---

## 5. 连接线与数据流

### 5.1 连接线渲染

Vue Flow 内置贝塞尔曲线支持，原项目的连接线逻辑可简化：

```vue
<!-- components/workflow/edges/CustomEdge.vue -->
<template>
  <BezierEdge
    :id="id"
    :source="source"
    :target="target"
    :source-x="sourceX"
    :source-y="sourceY"
    :target-x="targetX"
    :target-y="targetY"
    :source-position="sourcePosition"
    :target-position="targetPosition"
    :style="edgeStyle"
    :marker-end="markerEnd"
  />

  <!-- 删除按钮 -->
  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="edge-delete-button"
      @click="handleDelete"
    >
      <X class="w-3 h-3" />
    </div>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { BezierEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core';
import { X } from 'lucide-vue-next';

const props = defineProps<{
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  selected?: boolean;
  data?: { handleType?: string };
}>();

const workflowStore = useWorkflowStore();

// 计算中点位置
const [path, labelX, labelY] = getBezierPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  targetX: props.targetX,
  targetY: props.targetY,
  sourcePosition: props.sourcePosition,
  targetPosition: props.targetPosition,
});

// 边样式
const edgeStyle = computed(() => ({
  stroke: props.selected ? '#60a5fa' : '#a1a1aa',
  strokeWidth: props.selected ? 2 : 1,
  strokeDasharray: '4 4',
}));

function handleDelete() {
  workflowStore.removeEdge(props.id);
}
</script>
```

### 5.2 数据流获取

```typescript
// composables/useDataFlow.ts

export function useDataFlow(nodeId: string) {
  const workflowStore = useWorkflowStore();

  // 获取连接到当前节点的所有输入
  const connectedInputs = computed(() => {
    return workflowStore.getConnectedInputs(nodeId);
  });

  // 获取特定类型的输入
  const getInputsByType = (type: 'image' | 'video' | 'text') => {
    return computed(() => {
      return connectedInputs.value.filter(input => input.type === type);
    });
  };

  // 获取连接的图片（含关键帧处理）
  const connectedImages = computed(() => {
    const images: string[] = [];

    for (const input of connectedInputs.value) {
      const sourceNode = workflowStore.getNodeById(input.sourceId);
      if (!sourceNode) continue;

      switch (sourceNode.type) {
        case 'input-image':
          if (sourceNode.data.content) {
            images.push(sourceNode.data.content);
          }
          break;

        case 'video-input':
          // 使用选中的关键帧
          const keyframes = sourceNode.data.selectedKeyframes || [];
          images.push(...keyframes.map(f => f.url));
          break;

        case 'gen-image':
        case 'gen-video':
          // 从历史记录获取最新结果
          const latest = workflowStore.getLatestResult(sourceNode.id);
          if (latest?.url) {
            images.push(latest.url);
          }
          break;

        case 'preview':
          if (sourceNode.data.previewUrl) {
            images.push(sourceNode.data.previewUrl);
          }
          break;
      }
    }

    return images;
  });

  // 获取连接的视频
  const connectedVideo = computed(() => {
    for (const input of connectedInputs.value) {
      const sourceNode = workflowStore.getNodeById(input.sourceId);
      if (sourceNode?.type === 'video-input' && sourceNode.data.content) {
        return {
          url: sourceNode.data.content,
          duration: sourceNode.data.duration,
          frames: sourceNode.data.frames,
        };
      }
    }
    return null;
  });

  // 获取连接的文本
  const connectedTexts = computed(() => {
    return connectedInputs.value
      .filter(input => {
        const node = workflowStore.getNodeById(input.sourceId);
        return node?.type === 'text-node';
      })
      .map(input => {
        const node = workflowStore.getNodeById(input.sourceId);
        return node?.data.text || '';
      })
      .filter(Boolean);
  });

  return {
    connectedInputs,
    connectedImages,
    connectedVideo,
    connectedTexts,
    getInputsByType,
  };
}
```

---

## 6. 状态管理方案

### 6.1 Workflow Store

```typescript
// stores/workflow.ts

import { defineStore } from 'pinia';
import { applyNodeChanges, applyEdgeChanges } from '@vue-flow/core';
import type { NodeChange, EdgeChange } from '@vue-flow/core';
import type { WorkflowNode, WorkflowEdge, Workflow } from '~/types/workflow';

interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: { x: number; y: number; zoom: number };
  projectName: string;
  selectedNodeIds: Set<string>;
  history: HistoryItem[];
  // 撤销/重做
  undoStack: WorkflowSnapshot[];
  redoStack: WorkflowSnapshot[];
}

interface WorkflowSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  timestamp: number;
}

interface HistoryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  sourceNodeId: string;
  model: string;
  prompt?: string;
  status: 'generating' | 'completed' | 'failed';
  createdAt: string;
}

export const useWorkflowStore = defineStore('workflow', {
  state: (): WorkflowState => ({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    projectName: '未命名项目',
    selectedNodeIds: new Set(),
    history: [],
    undoStack: [],
    redoStack: [],
  }),

  getters: {
    // 节点 Map（O(1) 查找）
    nodesMap: (state) => {
      return new Map(state.nodes.map(n => [n.id, n]));
    },

    // 按节点分组的连接
    edgesByNode: (state) => {
      const bySource = new Map<string, WorkflowEdge[]>();
      const byTarget = new Map<string, WorkflowEdge[]>();

      for (const edge of state.edges) {
        if (!bySource.has(edge.source)) bySource.set(edge.source, []);
        if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
        bySource.get(edge.source)!.push(edge);
        byTarget.get(edge.target)!.push(edge);
      }

      return { bySource, byTarget };
    },

    // 获取节点
    getNodeById: (state) => (id: string) => {
      return state.nodes.find(n => n.id === id);
    },

    // 获取连接到节点的输入
    getConnectedInputs: (state) => (nodeId: string) => {
      return state.edges
        .filter(e => e.target === nodeId)
        .map(e => ({
          sourceId: e.source,
          handleType: e.data?.handleType || 'default',
        }));
    },

    // 获取连接的输入图片
    getConnectedInputImages() {
      return (nodeId: string) => {
        const inputs = this.getConnectedInputs(nodeId);
        const images: string[] = [];

        for (const input of inputs) {
          const node = this.getNodeById(input.sourceId);
          if (!node) continue;

          if (node.type === 'input-image' && node.data.content) {
            images.push(node.data.content);
          } else if (node.type === 'video-input' && node.data.selectedKeyframes) {
            images.push(...node.data.selectedKeyframes.map((f: any) => f.url));
          }
          // ... 其他类型
        }

        return images;
      };
    },

    // 获取最新生成结果
    getLatestResult: (state) => (nodeId: string) => {
      return state.history
        .filter(h => h.sourceNodeId === nodeId && h.status === 'completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        [0];
    },
  },

  actions: {
    // 应用节点变化
    applyNodeChanges(changes: NodeChange[]) {
      this.nodes = applyNodeChanges(changes, this.nodes);
    },

    // 应用边变化
    applyEdgeChanges(changes: EdgeChange[]) {
      this.edges = applyEdgeChanges(changes, this.edges);
    },

    // 创建节点
    createNode(type: string, x: number, y: number): WorkflowNode {
      const defaults = getNodeDefaults(type);

      const node: WorkflowNode = {
        id: `node-${Date.now()}`,
        type,
        position: { x: x - defaults.width / 2, y: y - defaults.height / 2 },
        data: { ...defaults.data },
        style: { width: `${defaults.width}px`, height: `${defaults.height}px` },
      };

      this.nodes.push(node);
      this.saveSnapshot();

      return node;
    },

    // 更新节点数据
    updateNodeData(nodeId: string, data: Partial<any>) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (node) {
        node.data = { ...node.data, ...data };
      }
    },

    // 删除节点
    removeNode(nodeId: string) {
      this.nodes = this.nodes.filter(n => n.id !== nodeId);
      this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
      this.saveSnapshot();
    },

    // 添加边
    addEdge(edge: WorkflowEdge) {
      this.edges.push(edge);
      this.saveSnapshot();
    },

    // 删除边
    removeEdge(edgeId: string) {
      this.edges = this.edges.filter(e => e.id !== edgeId);
      this.saveSnapshot();
    },

    // 清空选择
    clearSelection() {
      this.selectedNodeIds.clear();
    },

    // 添加历史记录
    addHistoryItem(item: Omit<HistoryItem, 'id' | 'createdAt'>) {
      this.history.push({
        ...item,
        id: `history-${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
    },

    // === 撤销/重做 ===
    saveSnapshot() {
      this.undoStack.push({
        nodes: JSON.parse(JSON.stringify(this.nodes)),
        edges: JSON.parse(JSON.stringify(this.edges)),
        timestamp: Date.now(),
      });
      // 限制历史长度
      if (this.undoStack.length > 50) {
        this.undoStack.shift();
      }
      // 新操作清空重做栈
      this.redoStack = [];
    },

    undo() {
      if (this.undoStack.length === 0) return;

      const current = {
        nodes: JSON.parse(JSON.stringify(this.nodes)),
        edges: JSON.parse(JSON.stringify(this.edges)),
        timestamp: Date.now(),
      };
      this.redoStack.push(current);

      const prev = this.undoStack.pop()!;
      this.nodes = prev.nodes;
      this.edges = prev.edges;
    },

    redo() {
      if (this.redoStack.length === 0) return;

      const current = {
        nodes: JSON.parse(JSON.stringify(this.nodes)),
        edges: JSON.parse(JSON.stringify(this.edges)),
        timestamp: Date.now(),
      };
      this.undoStack.push(current);

      const next = this.redoStack.pop()!;
      this.nodes = next.nodes;
      this.edges = next.edges;
    },

    // === 导入/导出 ===
    exportWorkflow(): Workflow {
      return {
        version: '1.0.0',
        projectName: this.projectName,
        nodes: JSON.parse(JSON.stringify(this.nodes)),
        edges: JSON.parse(JSON.stringify(this.edges)),
        viewport: { ...this.viewport },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    },

    importWorkflow(workflow: Workflow) {
      this.nodes = workflow.nodes;
      this.edges = workflow.edges;
      this.viewport = workflow.viewport;
      this.projectName = workflow.projectName;
      this.saveSnapshot();
    },

    // 重置
    reset() {
      this.nodes = [];
      this.edges = [];
      this.viewport = { x: 0, y: 0, zoom: 1 };
      this.projectName = '未命名项目';
      this.selectedNodeIds.clear();
      this.undoStack = [];
      this.redoStack = [];
    },
  },

  // 持久化（使用 pinia-plugin-persistedstate）
  persist: {
    key: 'workflow',
    storage: localStorage,
    paths: ['nodes', 'edges', 'viewport', 'projectName', 'history'],
  },
});

// 节点默认配置
function getNodeDefaults(type: string) {
  const defaults: Record<string, { width: number; height: number; data: any }> = {
    'input-image': { width: 260, height: 260, data: {} },
    'video-input': { width: 360, height: 420, data: {} },
    'gen-image': { width: 360, height: 340, data: { model: 'nano-banana', prompt: '' } },
    'gen-video': { width: 320, height: 420, data: { model: 'sora-2', duration: '5s' } },
    'video-analyze': { width: 400, height: 500, data: { model: 'gemini-3-pro' } },
    'preview': { width: 320, height: 260, data: {} },
    'text-node': { width: 280, height: 200, data: { text: '' } },
    'image-compare': { width: 400, height: 300, data: {} },
    'local-save': { width: 320, height: 380, data: { autoSave: false } },
  };

  return defaults[type] || { width: 260, height: 260, data: {} };
}
```

---

## 7. 持久化与导入导出

### 7.1 本地存储策略

```typescript
// composables/usePersistence.ts

import localforage from 'localforage';

// 大文件使用 IndexedDB
const mediaStore = localforage.createInstance({
  name: 'workflow-media',
  storeName: 'blobs',
});

export function usePersistence() {
  const workflowStore = useWorkflowStore();

  // 保存到 localStorage（JSON 数据）
  const saveToLocal = () => {
    const workflow = workflowStore.exportWorkflow();
    localStorage.setItem('workflow_data', JSON.stringify(workflow));
  };

  // 从 localStorage 加载
  const loadFromLocal = () => {
    const saved = localStorage.getItem('workflow_data');
    if (saved) {
      workflowStore.importWorkflow(JSON.parse(saved));
    }
  };

  // 保存媒体文件到 IndexedDB
  const saveMedia = async (id: string, blob: Blob) => {
    await mediaStore.setItem(id, blob);
    return id;
  };

  // 获取媒体文件
  const getMedia = async (id: string): Promise<Blob | null> => {
    return await mediaStore.getItem(id);
  };

  // 导出为文件
  const exportToFile = async () => {
    const workflow = workflowStore.exportWorkflow();

    // 处理 Blob URL 转 Base64
    const processedWorkflow = await processMediaUrls(workflow);

    const blob = new Blob(
      [JSON.stringify(processedWorkflow, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.projectName}_${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 从文件导入
  const importFromFile = async (file: File) => {
    const text = await file.text();
    const workflow = JSON.parse(text);

    // 恢复 Base64 为 Blob URL
    const restoredWorkflow = await restoreMediaUrls(workflow);

    workflowStore.importWorkflow(restoredWorkflow);
  };

  // 自动保存
  const { pause, resume } = useIntervalFn(() => {
    saveToLocal();
  }, 30000); // 每 30 秒自动保存

  return {
    saveToLocal,
    loadFromLocal,
    saveMedia,
    getMedia,
    exportToFile,
    importFromFile,
    pauseAutoSave: pause,
    resumeAutoSave: resume,
  };
}

// 处理媒体 URL（Blob → Base64）
async function processMediaUrls(workflow: Workflow): Promise<Workflow> {
  const processed = JSON.parse(JSON.stringify(workflow));

  for (const node of processed.nodes) {
    if (node.data.content?.startsWith('blob:')) {
      node.data.content = await blobUrlToBase64(node.data.content);
    }
    // 处理其他媒体字段...
  }

  return processed;
}

async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

---

## 8. 性能优化策略

### 8.1 原项目优化手段（保留）

| 优化点 | 原实现 | Vue Flow 对应 |
|-------|-------|---------------|
| requestAnimationFrame 节流 | 手动实现 | Vue Flow 内置 |
| 节点 Map 快速查找 | `new Map()` | 使用 getter 缓存 |
| 可见区域节点筛选 | 手动计算 | `useNodesInViewport` |
| 批量节点更新 | `scheduleMultiNodeUpdate` | 合并 `applyNodeChanges` |
| 连接线透明度降级 | CSS opacity | 同样实现 |

### 8.2 Vue Flow 特有优化

```typescript
// composables/usePerformance.ts

export function usePerformance() {
  const { getNodes, getEdges, viewport } = useVueFlow();

  // 1. 虚拟化：仅渲染可见节点
  const visibleNodes = computed(() => {
    const vp = viewport.value;
    const buffer = 100; // 缓冲区

    return getNodes.value.filter(node => {
      const x = node.position.x * vp.zoom + vp.x;
      const y = node.position.y * vp.zoom + vp.y;

      return (
        x + node.width! * vp.zoom > -buffer &&
        x < window.innerWidth + buffer &&
        y + node.height! * vp.zoom > -buffer &&
        y < window.innerHeight + buffer
      );
    });
  });

  // 2. 性能模式：关闭动画
  const isPerformanceMode = ref(false);

  watch(isPerformanceMode, (enabled) => {
    document.body.classList.toggle('perf-mode', enabled);
  });

  // 3. 缩略图缓存
  const thumbnailCache = new Map<string, string>();

  const generateThumbnail = async (url: string, maxSize = 150): Promise<string> => {
    if (thumbnailCache.has(url)) {
      return thumbnailCache.get(url)!;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = await loadImage(url);

    const ratio = Math.min(maxSize / img.width, maxSize / img.height);
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL('image/jpeg', 0.6);

    thumbnailCache.set(url, thumbnail);
    return thumbnail;
  };

  return {
    visibleNodes,
    isPerformanceMode,
    generateThumbnail,
  };
}
```

### 8.3 CSS 性能优化

```css
/* assets/css/performance.css */

/* 性能模式样式 */
.perf-mode .vue-flow__node {
  box-shadow: none !important;
  transition: none !important;
}

.perf-mode .vue-flow__edge-path {
  animation: none !important;
}

.perf-mode .vue-flow__node img,
.perf-mode .vue-flow__node video {
  image-rendering: pixelated;
}

/* GPU 加速 */
.vue-flow__node {
  transform: translateZ(0);
  will-change: transform;
}

/* 交互时降级 */
.vue-flow__pane--dragging .vue-flow__node {
  transition: none !important;
}

.vue-flow__pane--dragging .vue-flow__node img {
  pointer-events: none;
  filter: blur(1px);
}
```

---

## 9. 项目结构参考

```
project/
├── nuxt.config.ts
├── app.vue
├── pages/
│   └── index.vue              # 主画布页面
│
├── components/
│   └── workflow/
│       ├── WorkflowCanvas.vue     # 画布主组件
│       ├── ContextMenu.vue        # 右键菜单
│       ├── Toolbar.vue            # 工具栏
│       ├── HistoryPanel.vue       # 历史记录面板
│       │
│       ├── nodes/                 # 节点组件
│       │   ├── NodeBase.vue
│       │   ├── NodeInputImage.vue
│       │   ├── NodeVideoInput.vue
│       │   ├── NodeGenImage.vue
│       │   ├── NodeGenVideo.vue
│       │   ├── NodeVideoAnalyze.vue
│       │   ├── NodePreview.vue
│       │   ├── NodeText.vue
│       │   ├── NodeImageCompare.vue
│       │   └── NodeLocalSave.vue
│       │
│       └── edges/                 # 边组件
│           └── CustomEdge.vue
│
├── composables/
│   ├── useWorkflow.ts            # 工作流逻辑
│   ├── useDataFlow.ts            # 数据流获取
│   ├── usePersistence.ts         # 持久化
│   ├── usePerformance.ts         # 性能优化
│   └── useKeyboardShortcuts.ts   # 快捷键
│
├── stores/
│   ├── workflow.ts               # 工作流状态
│   ├── api.ts                    # API 配置
│   └── history.ts                # 历史记录
│
├── types/
│   ├── workflow.ts               # 类型定义
│   └── api.ts
│
├── utils/
│   ├── media.ts                  # 媒体处理
│   ├── video.ts                  # 视频帧提取
│   └── export.ts                 # 导入导出
│
└── assets/
    └── css/
        ├── vue-flow.css          # Vue Flow 自定义样式
        └── performance.css       # 性能优化样式
```

---

## 10. 实施路线图

### 阶段一：基础架构（核心功能）

- [ ] Nuxt 3 项目初始化
- [ ] Vue Flow 集成与配置
- [ ] 基础画布组件（平移、缩放、背景网格）
- [ ] 基础节点组件（NodeBase）
- [ ] Pinia Store 搭建
- [ ] 基础持久化（localStorage）

### 阶段二：节点系统

- [ ] 输入节点（input-image, video-input）
- [ ] 生成节点（gen-image, gen-video）
- [ ] 工具节点（preview, text-node, image-compare）
- [ ] 节点连接验证逻辑
- [ ] 数据流传递

### 阶段三：增强功能

- [ ] 撤销/重做
- [ ] 小地图
- [ ] 框选多选
- [ ] 键盘快捷键（Delete、Ctrl+C/V、Ctrl+Z）
- [ ] 导入/导出工作流

### 阶段四：性能优化

- [ ] 节点虚拟化
- [ ] 缩略图缓存
- [ ] 性能模式开关
- [ ] IndexedDB 大文件存储

### 阶段五：业务集成

- [ ] API 配置管理
- [ ] AI 模型调用
- [ ] 历史记录面板
- [ ] 角色/场景库

---

## 参考资源

- [Vue Flow 官方文档](https://vueflow.dev/)
- [Vue Flow GitHub](https://github.com/bcakmakoglu/vue-flow)
- [Vue Flow Examples](https://vueflow.dev/examples/)
- [Nuxt 3 文档](https://nuxt.com/docs)
- [Pinia 文档](https://pinia.vuejs.org/)

---

*文档版本: 1.0.0*
*创建日期: 2025-12-29*
*基于项目: Tapnow Studio V2.6*

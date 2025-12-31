# 工作流执行设计文档

## 概述

本文档描述 MJ-Studio 工作流系统的执行机制设计，参考 ComfyUI 的执行模型并结合项目需求进行调整。

## 核心概念

### 工作流 (Workflow)

工作流是节点和连接的静态定义，存储在 JSON 文件中。工作流本身**无状态**，不包含执行结果。

### 执行记录 (Run)

每次执行工作流会创建一个 Run 记录：
- **快照 (Snapshot)**：创建 Run 时复制工作流定义，后续执行完全基于快照，不依赖原 workflow
- **节点状态**：记录每个节点的执行状态和输出结果

## 页面模式

工作流页面有两种互斥的模式：

### 编辑模式

- **URL**：`/workflow/:id`
- **数据源**：workflow JSON 文件
- **操作**：编辑节点、连接、参数、保存
- **特点**：可编辑，无执行状态

### 运行模式

- **URL**：`/workflow-run/:runId`
- **数据源**：run.snapshot（工作流快照）+ run 状态
- **操作**：查看状态、执行节点、中止、重试、切换运行模式
- **特点**：只读，不可修改工作流定义

### 模式切换

```
编辑模式 ──点击"运行"──→ 创建新 Run ──→ 运行模式
/workflow/:id                           /workflow-run/:runId
                                              │
运行模式 ──点击"返回编辑"──→ 编辑模式         │
                                              │
历史记录 ──点击某个 Run─────────────────────→─┘
```

## 运行模式 (Run Mode)

Run 有两种运行模式，可在运行过程中随时切换：

| 模式 | 说明 | 节点执行后 |
|-----|------|-----------|
| `normal` | 普通模式 | 自动执行下一个节点，直到全部完成 |
| `step` | 单步模式 | 暂停，等待用户手动触发下一步 |

### 使用场景

**普通模式 → 单步模式**：
- Run 在某个节点失败，切换到单步模式反复调试该节点

**单步模式 → 普通模式**：
- 反复调试某个节点直到满意，切换到普通模式让剩余节点自动执行

### 工具栏

**运行模式**：
```
[返回编辑] [执行节点▼] [继续运行] [中止]    [普通模式 ▼]  Run #42 ●运行中
                                            ~~~~~~~~~~
                                            运行模式选择器
```

## 执行模式

### 1. 执行整个工作流

从编辑模式点击"运行"：
1. 创建新 Run（默认普通模式），保存工作流快照
2. 页面切换到运行模式
3. 按拓扑排序依次执行所有生成节点

```
[文本] → [生图] → [预览]
   ↓
拓扑排序后执行顺序: 生图
```

### 2. 执行单个节点

在运行模式下，点击某个节点的"执行"按钮：
- **只执行当前节点**
- 如果是单步模式：Run 状态变为 `paused`
- 如果是普通模式：自动继续执行后续节点

**使用场景**：
- 单步调试：逐个验证节点配置
- 重新生成：对节点结果不满意时，单独重跑

### 3. 继续执行

在 `paused` 状态下，点击"继续运行"：
- 如果是单步模式：执行下一个节点后再次暂停
- 如果是普通模式：执行剩余所有节点

### 4. 重试整个 Run

在 `failed`/`cancelled`/`completed` 状态下，点击"重试"：
- 重置所有节点状态
- 重新从头执行（基于同一个快照）

## Run 状态流转

```
              ┌─────────────────────────────────────┐
              │                                     │
              ▼                                     │
pending → running → completed                      │
              │         │                          │
              ├→ paused ┼──执行节点/继续运行──→ running
              │         │
              ├→ failed ┼──重试──→ running
              │         │
              └→ cancelled ──重试──→ running
```

| 状态 | 说明 | 可用操作 |
|-----|------|---------|
| `pending` | 刚创建，等待执行 | - |
| `running` | 执行中 | 查看进度、中止、切换运行模式 |
| `paused` | 单步执行后暂停 | 执行节点、继续运行、重试、切换运行模式 |
| `completed` | 全部完成 | 执行节点、重试 |
| `failed` | 执行失败 | 执行节点、重试、切换运行模式 |
| `cancelled` | 用户取消 | 执行节点、重试 |

## RunNode 状态流转

```
idle → pending → processing → success
   │                      ↘ failed
   ↓
skipped (从指定节点开始执行时，跳过之前的节点)
```

| 状态 | 说明 |
|-----|------|
| `idle` | 初始状态，还没轮到执行 |
| `pending` | 即将执行（用于视觉提示，标记下一批要执行的节点） |
| `processing` | 正在执行中 |
| `success` | 执行成功 |
| `failed` | 执行失败 |
| `skipped` | 跳过（从指定节点开始执行时，该节点之前的节点） |

## 页面布局

### 左侧边栏（可收缩/展开）

**收缩状态**（默认宽度约 48px）：
```
┌──────┐
│ ≡    │  ← 展开按钮
├──────┤
│ 标题 │  ← 工作流名称（纵向）
├──────┤
│ ▶    │  ← 运行按钮
│ 💾   │  ← 保存按钮
└──────┘
```

**展开状态**（宽度约 280px）：
```
┌─────────────────────────┐
│ 工作流名称        [收缩]│
├─────────────────────────┤
│ [▶ 运行] [💾 保存]      │
├─────────────────────────┤
│ 运行历史                │
│ ┌─────────────────────┐ │
│ │ #42 ●运行中  12:30  │ │
│ │ #41 ✓完成    12:15  │ │
│ │ #40 ✗失败    12:00  │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### 主画布区域

- 占据除侧边栏外的全部空间
- 编辑模式：可编辑节点、连接
- 运行模式：只读，显示节点执行状态

### 运行模式工具栏（浮动在画布上方）

当处于运行模式时，画布顶部显示浮动工具栏：
```
┌──────────────────────────────────────────────────────────┐
│ [返回编辑] [执行节点▼] [继续运行] [中止]  [普通模式▼]  Run #42 ●运行中 │
└──────────────────────────────────────────────────────────┘
```

- **运行模式选择器**：可切换普通模式/单步模式
- **操作按钮**：根据 Run 状态显示/隐藏

### 进入编辑模式

1. 直接访问 `/workflow/:id`
2. 加载 workflow JSON 文件
3. 渲染可编辑的工作流画布

### 进入运行模式

1. 访问 `/workflow-run/:runId`
2. 加载 run 记录和快照文件
3. 加载 run_nodes 状态
4. 渲染只读的工作流画布（来自 workflow-run）+ 节点状态
5. 订阅 SSE，监听实时更新

### 点击"运行"（从编辑模式）

1. POST `/api/workflows/:id/run` 创建新 Run
2. 后端：复制工作流为快照，创建 Run 记录
3. 返回 runId
4. 前端跳转到 `/workflow-run/:runId`
5. 后端开始执行，前端通过 SSE 接收更新

### 执行单个节点（运行模式）

1. POST `/api/workflow-runs/:runId/execute-node`
2. Body: `{ nodeId: string }`
3. 后端执行该节点，更新 run_node 状态
4. 根据 runMode 决定是否继续执行后续节点
5. 前端通过 SSE 接收更新

### 切换运行模式

1. PATCH `/api/workflow-runs/:runId`
2. Body: `{ runMode: 'normal' | 'step' }`
3. 后端更新 runMode
4. 前端通过 SSE 接收 run_mode_changed 事件

### 刷新页面

1. 根据 URL 判断模式
2. 运行模式：加载 Run 状态，如果 `running` 则订阅 SSE
3. 编辑模式：加载 workflow JSON

## SSE 实时通信

### 订阅方式

```
GET /api/workflow-runs/:runId/events
```

订阅单个 Run 的事件流。

### 事件类型

```typescript
// Run 状态变化
{
  type: 'run_status',
  runId: number,
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
}

// Run 模式变化
{
  type: 'run_mode_changed',
  runId: number,
  runMode: 'normal' | 'step'
}

// 节点执行状态变化
{
  type: 'run_node_status',
  runId: number,
  nodeId: string,
  status: 'pending' | 'processing' | 'success' | 'failed',
  outputs?: object,  // 成功时包含输出
  error?: string     // 失败时包含错误
}

// 节点执行进度更新（生成节点）
{
  type: 'run_node_progress',
  runId: number,
  nodeId: string,
  progress: number,  // 0-100
  taskId: number
}
```

### 多端同步

- 同一 Run 的多个浏览器标签页都订阅同一个 SSE
- 任意一端触发操作，所有端都能收到状态更新
- 刷新页面后，先加载 Run 状态，再订阅 SSE

## API 设计

### 创建并执行工作流

```
POST /api/workflows/:id/run
Body: { runMode?: 'normal' | 'step' }  // 默认 normal
Response: { success: true, runId: number }
```

创建新 Run（含快照），开始执行整个工作流。

### 执行单个节点

```
POST /api/workflow-runs/:runId/execute-node
Body: { nodeId: string }
Response: { success: true }
```

在指定 Run 中执行单个节点。

### 继续执行

```
POST /api/workflow-runs/:runId/continue
Response: { success: true }
```

从当前位置继续执行。

### 重试整个 Run

```
POST /api/workflow-runs/:runId/retry
Response: { success: true }
```

重置所有节点状态，重新执行。

### 中止执行

```
POST /api/workflow-runs/:runId/cancel
Response: { success: true }
```

### 更新 Run（切换运行模式）

```
PATCH /api/workflow-runs/:runId
Body: { runMode: 'normal' | 'step' }
Response: { success: true }
```

### 获取 Run 详情

```
GET /api/workflow-runs/:runId
Response: {
  success: true,
  data: {
    id: number,
    workflowId: number,
    status: string,
    runMode: string,
    snapshotFilename: string,
    nodes: [
      { nodeId: string, status: string, outputs: object, error?: string }
    ]
  }
}
```

### 获取工作流的 Run 历史

```
GET /api/workflows/:id/runs
Response: {
  success: true,
  data: [
    { id: number, status: string, runMode: string, createdAt: string }
  ]
}
```

### 订阅 Run 事件

```
GET /api/workflow-runs/:runId/events
Response: SSE stream
```

## 与 ComfyUI 的差异

| 特性 | ComfyUI | MJ-Studio |
|-----|---------|-----------|
| 单节点执行 | 不支持 | 支持（单步调试） |
| 执行触发下游 | 自动执行 | 根据 runMode 决定 |
| 运行模式切换 | 不支持 | 支持（普通/单步） |
| 工作流快照 | 不保存 | 每次 Run 保存快照 |
| 执行历史 | /history | workflow_runs + workflow_run_nodes 表 |
| 实时通信 | WebSocket | SSE |
| 多端同步 | 不支持 | 支持 |
| 页面模式 | 单一模式 | 编辑模式/运行模式 |

## 后续扩展

- **定时工作流**：添加 cron 表达式，后台定时创建 Run
- **异步工作流**：支持长时间运行，用户可关闭页面
- **条件分支**：根据上游输出决定是否执行
- **循环节点**：重复执行某个分支
- **工作流模板参数化**：Run 时传入参数覆盖节点配置

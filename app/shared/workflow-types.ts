// 工作流相关类型定义

// 节点类型
export type WorkflowNodeType =
  | 'input-image'
  | 'text-node'
  | 'gen-image'
  | 'gen-video'
  | 'preview'

// 节点位置
export interface NodePosition {
  x: number
  y: number
}

// 节点基础数据
export interface BaseNodeData {
  label: string
  status?: 'idle' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
}

// 图片输入节点数据
export interface InputImageNodeData extends BaseNodeData {
  imageUrl?: string // 本地图片 URL
}

// 文本节点数据
export interface TextNodeData extends BaseNodeData {
  text?: string
}

// 图像生成节点数据
export interface GenImageNodeData extends BaseNodeData {
  model?: string
  prompt?: string
  upstreamId?: number
  aimodelId?: number
  resultUrl?: string // 生成结果
}

// 视频生成节点数据
export interface GenVideoNodeData extends BaseNodeData {
  model?: string
  prompt?: string
  upstreamId?: number
  aimodelId?: number
  resultUrl?: string
}

// 预览节点数据
export interface PreviewNodeData extends BaseNodeData {
  previewUrl?: string
}

// 节点数据联合类型
export type WorkflowNodeData =
  | InputImageNodeData
  | TextNodeData
  | GenImageNodeData
  | GenVideoNodeData
  | PreviewNodeData

// 工作流节点
export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  position: NodePosition
  data: WorkflowNodeData
}

// 工作流边（连接线）
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// 视口状态
export interface WorkflowViewport {
  x: number
  y: number
  zoom: number
}

// 工作流 JSON 文件结构
export interface WorkflowData {
  version: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  viewport: WorkflowViewport
  metadata?: {
    createdAt: string
    updatedAt: string
  }
}

// 工作流列表项（API 返回）
export interface WorkflowListItem {
  id: number
  name: string
  description?: string
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

// 工作流模板列表项
export interface WorkflowTemplateListItem {
  id: number
  name: string
  description?: string
  category: 'image' | 'video' | 'mixed'
  thumbnail?: string
  isBuiltin: boolean
  usageCount: number
}

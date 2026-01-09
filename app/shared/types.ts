/**
 * 共享类型定义
 *
 * 本文件定义前后端共用的核心类型，确保类型一致性。
 * 任何涉及模型配置、任务状态的功能都应引用此文件。
 */

// ==================== 模型分类 ====================

/**
 * 模型分类
 * - 用于区分绘图模型、对话模型和视频模型
 * - 使用场景：模型配置表单、模型列表筛选
 */
export type ModelCategory = 'image' | 'chat' | 'video'

// ==================== 绘图相关类型 ====================

/**
 * 支持的绘图模型类型
 * - 用于标识不同的图像生成服务
 * - 使用场景：任务创建、模型配置、任务卡片显示
 */
export type ImageModelType =
  | 'midjourney'   // Midjourney，支持 U/V 操作
  | 'gemini'       // Google Gemini 绘图
  | 'flux'         // Flux 图像生成
  | 'dalle'        // OpenAI DALL-E
  | 'doubao'       // 字节豆包
  | 'gpt4o-image'  // GPT-4o 图像生成
  | 'gpt-image'    // GPT Image 系列（gpt-image-1, gpt-image-1.5）
  | 'sora-image'   // Sora 图像生成
  | 'grok-image'   // xAI Grok 图像生成
  | 'qwen-image'   // 阿里通义万相
  | 'z-image'      // Gitee AI Z-Image
  | 'koukoutu'     // 抠抠图（背景移除）

// ==================== 对话相关类型 ====================

/**
 * 支持的对话模型类型
 * - 用于标识不同的对话服务
 * - 使用场景：助手配置、对话消息发送
 */
export type ChatModelType =
  | 'gpt'          // OpenAI GPT 系列
  | 'claude'       // Anthropic Claude 系列
  | 'gemini-chat'  // Google Gemini 对话
  | 'deepseek'     // DeepSeek
  | 'qwen-chat'    // 阿里通义千问
  | 'grok'         // xAI Grok 系列
  | 'llama'        // Meta LLaMA 系列
  | 'moonshot'     // 月之暗面 Kimi
  | 'glm'          // 智谱 GLM 系列
  | 'doubao-chat'  // 字节豆包对话
  | 'minimax'      // MiniMax
  | 'hunyuan'      // 腾讯混元
  | 'mixtral'      // Mistral Mixtral
  | 'phi'          // Microsoft Phi

// ==================== 视频相关类型 ====================

/**
 * 支持的视频模型类型
 * - 用于标识不同的视频生成服务
 * - 使用场景：任务创建、模型配置、任务卡片显示
 */
export type VideoModelType =
  | 'jimeng-video'  // 即梦视频
  | 'veo'           // Google Veo
  | 'sora'          // OpenAI Sora
  | 'grok-video'    // xAI Grok Video

/**
 * 所有模型类型的联合
 * - 使用场景：模型配置表单中选择模型类型
 */
export type ModelType = ImageModelType | ChatModelType | VideoModelType

// ==================== API 格式类型 ====================

/**
 * 支持的 API 请求格式
 * - 不同中转站可能使用不同的 API 格式
 * - 使用场景：任务创建时选择请求格式、服务层路由
 */
export type ApiFormat =
  | 'mj-proxy'       // MJ-Proxy 格式，用于 Midjourney
  | 'gemini'         // Google Gemini API 原生格式
  | 'dalle'          // OpenAI DALL-E Images API 格式
  | 'openai-chat'    // OpenAI Chat Completions API 格式
  | 'claude'         // Anthropic Claude Messages API 格式
  | 'koukoutu'       // 抠抠图 API 格式（异步轮询）
  | 'video-unified'  // 视频统一格式（/v1/video/create），用于即梦、Veo

// ==================== 任务类型 ====================

/**
 * 任务类型
 * - 用于区分图片任务和视频任务
 * - 使用场景：任务创建、任务列表筛选、卡片渲染
 */
export type TaskType = 'image' | 'video'

// ==================== 任务状态类型 ====================

/**
 * 任务状态
 * - 用于追踪任务的生命周期（图片和视频共用）
 * - 使用场景：任务列表显示、状态轮询、进度条控制
 */
export type TaskStatus =
  | 'pending'      // 等待提交
  | 'submitting'   // 正在提交到上游
  | 'processing'   // 上游处理中
  | 'success'      // 生成成功
  | 'failed'       // 生成失败
  | 'cancelled'    // 已取消

// ==================== 消息角色类型 ====================

/**
 * 消息角色
 * - 用于标识对话消息的发送者
 * - 使用场景：对话历史显示、消息列表渲染
 */
export type MessageRole = 'user' | 'assistant'

/**
 * 消息标记
 * - 用于标识特殊类型的消息
 * - 使用场景：错误消息、压缩消息的识别
 */
export type MessageMark = 'error' | 'compress-request' | 'compress-response'

/**
 * AI 消息状态
 * - 用于追踪 AI 消息的生成生命周期
 * - 用户消息的 status 为 null
 */
export type MessageStatus =
  | 'created'    // 已创建，尚未发起上游请求
  | 'pending'    // 已发起上游请求，等待响应
  | 'streaming'  // 正在接收流式输出
  | 'completed'  // 生成完成
  | 'stopped'    // 用户中断
  | 'failed'     // 生成失败

// ==================== 消息文件类型 ====================

/**
 * 消息附件文件
 * - 用于存储对话消息中的文件信息
 * - 使用场景：多模态对话、文件上传
 */
export interface MessageFile {
  /** 原始文件名 */
  name: string
  /** 存储文件名（服务器生成的唯一名称） */
  fileName: string
  /** MIME 类型 */
  mimeType: string
  /** 文件大小（字节） */
  size: number
}

// ==================== 上游平台类型 ====================

/**
 * 上游平台类型
 * - 用于标识上游 API 平台，便于余额查询等功能
 * - oneapi: OneAPI/NewAPI 格式，GET /api/user/self
 */
export type UpstreamPlatform = 'oneapi' | 'n1n' | 'yunwu'

/**
 * 上游信息缓存
 * - 存储从上游 API 查询到的用户信息
 * - 使用场景：余额显示、用户信息展示
 */
export interface UpstreamInfo {
  /** 用户 ID */
  userId?: number
  /** 用户名 */
  username?: string
  /** 显示名称 */
  displayName?: string
  /** 邮箱 */
  email?: string
  /** 原始配额 */
  quota?: number
  /** 已用配额 */
  usedQuota?: number
  /** 用户组 */
  group?: string
  /** 查询时间 */
  queriedAt?: string
}

// ==================== API Key 配置 ====================

/**
 * API Key 配置
 * - 用于存储上游的多个 API Key
 * - 使用场景：模型配置中的多 Key 管理
 */
export interface ApiKeyConfig {
  /** Key 名称，如 "default", "premium", "backup" */
  name: string
  /** API Key 值 */
  key: string
}

// ==================== 模型参数类型 ====================

/**
 * 生图模型参数
 * - 适用于 MJ-Proxy、DALL-E、Gemini、OpenAI Chat 等格式
 */
export interface ImageModelParams {
  /** 负面提示词（MJ、Flux） */
  negativePrompt?: string
  /** 尺寸：1024x1024 等（DALL-E、GPT-Image、豆包） */
  size?: string
  /** 宽高比：16:9 等（Flux） */
  aspectRatio?: string
  /** 生成数量：1-10 */
  n?: number
  /** 随机种子（豆包） */
  seed?: number
  /** 质量（DALL-E 3: standard/hd，GPT Image: high/medium/low） */
  quality?: 'standard' | 'hd' | 'high' | 'medium' | 'low'
  /** 风格（DALL-E 3） */
  style?: 'vivid' | 'natural'
  /** 提示词相关度：1-10（豆包） */
  guidanceScale?: number
  /** 水印（豆包） */
  watermark?: boolean
  /** 机器人类型（MJ） */
  botType?: 'MID_JOURNEY' | 'NIJI_JOURNEY'
  /** 背景透明度（GPT Image） */
  background?: 'auto' | 'transparent' | 'opaque'
}

/**
 * 即梦视频参数
 */
export interface JimengVideoParams {
  /** 宽高比：16:9, 9:16, 4:3, 3:4, 1:1, 21:9 */
  aspectRatio?: string
  /** 分辨率：1080P、1280x720、720x1280 */
  size?: string
}

/**
 * Veo 视频参数
 */
export interface VeoVideoParams {
  /** 宽高比：16:9, 9:16 */
  aspectRatio?: string
  /** 提示词增强 */
  enhancePrompt?: boolean
  /** 超分辨率 */
  enableUpsample?: boolean
  /** 图片模式 */
  imageMode?: 'reference' | 'frames' | 'components'
}

/**
 * Sora 视频参数
 */
export interface SoraVideoParams {
  /** 方向（替代宽高比） */
  orientation?: 'portrait' | 'landscape'
  /** 分辨率（必填） */
  size: 'small' | 'large'
  /** 时长：10、15 等 */
  duration?: number
  /** 水印 */
  watermark?: boolean
  /** 隐私模式 */
  private?: boolean
}

/**
 * Grok Video 参数
 */
export interface GrokVideoParams {
  /** 宽高比：2:3, 3:2, 1:1 */
  aspectRatio?: string
  /** 分辨率：720P */
  size?: string
}

/**
 * 模型参数联合类型
 * - 使用场景：任务创建、表单提交
 */
export type ModelParams =
  | ImageModelParams
  | JimengVideoParams
  | VeoVideoParams
  | SoraVideoParams
  | GrokVideoParams

// ==================== 模型类型配置接口 ====================

/**
 * 模型类型配置
 * - 描述一个上游配置中支持的单个模型
 * - 使用场景：模型配置存储、绘图面板模型选择、设置页面模型配置编辑
 */
export interface ModelTypeConfig {
  /** 模型分类，默认 'image' 兼容旧数据 */
  category?: ModelCategory
  /** 界面显示的模型类型 */
  modelType: ModelType
  /** 实际请求时使用的 API 格式 */
  apiFormat: ApiFormat
  /** 发送给上游的模型标识符 */
  modelName: string
  /** 预计时间（秒）：绘图模型为预计生成时间，对话模型为预计首字时长 */
  estimatedTime?: number
  /** 使用的 Key 名称，默认 "default" */
  keyName?: string
}

// ==================== 认证用户类型 ====================

/**
 * 认证用户信息
 * - 用于 JWT payload 和前端用户状态
 * - 使用场景：登录、用户信息显示
 */
export interface AuthUser {
  id: number
  email: string
  name: string | null
  avatar?: string | null
}

// ==================== AI 模型输入类型 ====================

/**
 * AI 模型输入（创建/更新时使用）
 * - 使用场景：上游配置表单提交
 */
export interface AimodelInput {
  /** 编辑时的 ID，新建时为空 */
  id?: number
  category: ModelCategory
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  /** 显示名称（用户可自定义） */
  name: string
  estimatedTime?: number
  keyName?: string
}

// ==================== 分页响应类型 ====================

/**
 * 分页响应
 * - 用于任务列表、回收站等分页接口
 */
export interface PaginatedResponse<T> {
  tasks: T[]
  total: number
  page: number
  pageSize: number
}

// ==================== 任务上游摘要类型 ====================

/**
 * 任务上游摘要（精简版，用于任务列表/详情）
 * - 使用场景：任务卡片、任务详情弹窗
 */
export interface TaskUpstreamSummary {
  name: string
  estimatedTime: number | null
  /** AI 模型的显示名称 */
  aimodelName: string
}

// ==================== 错误处理工具 ====================

/**
 * 从 unknown 类型的错误中提取错误信息
 * - 替代 error: any 模式
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return '未知错误'
}

/**
 * 检查是否为 abort 错误
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('aborted') ||
      error.message.includes('abort')
    )
  }
  if (error && typeof error === 'object') {
    const e = error as { name?: string; message?: string; cause?: { name?: string } }
    return (
      e.name === 'AbortError' ||
      e.cause?.name === 'AbortError' ||
      e.message?.includes('aborted') ||
      e.message?.includes('abort') ||
      false
    )
  }
  return false
}

/**
 * 从 fetch 错误响应中提取详细信息
 */
export async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (data && typeof data === 'object') {
      // 尝试多种常见的错误字段
      return data.message || data.error?.message || data.error || data.detail || response.statusText
    }
  } catch {
    // JSON 解析失败，使用 statusText
  }
  return response.statusText || `HTTP ${response.status}`
}

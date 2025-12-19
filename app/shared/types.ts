/**
 * 共享类型定义
 *
 * 本文件定义前后端共用的核心类型，确保类型一致性。
 * 任何涉及模型配置、任务状态的功能都应引用此文件。
 */

// ==================== 模型分类 ====================

/**
 * 模型分类
 * - 用于区分绘图模型和对话模型
 * - 使用场景：模型配置表单、模型列表筛选
 */
export type ModelCategory = 'image' | 'chat'

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
  | 'grok-image'   // xAI Grok 图像生成
  | 'qwen-image'   // 阿里通义万相

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

/**
 * 所有模型类型的联合
 * - 使用场景：模型配置表单中选择模型类型
 */
export type ModelType = ImageModelType | ChatModelType

// ==================== API 格式类型 ====================

/**
 * 支持的 API 请求格式
 * - 不同中转站可能使用不同的 API 格式
 * - 使用场景：任务创建时选择请求格式、服务层路由
 */
export type ApiFormat =
  | 'mj-proxy'     // MJ-Proxy 格式，用于 Midjourney
  | 'gemini'       // Google Gemini API 原生格式
  | 'dalle'        // OpenAI DALL-E Images API 格式
  | 'openai-chat'  // OpenAI Chat Completions API 格式

// ==================== 任务状态类型 ====================

/**
 * 任务状态
 * - 用于追踪绘图任务的生命周期
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
  /** 预计生成时间（秒），仅绘图模型需要，用于进度条显示 */
  estimatedTime?: number
}

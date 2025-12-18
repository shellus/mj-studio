/**
 * 共享常量定义
 *
 * 本文件定义前后端共用的常量，每个常量都标注了使用场景。
 * 修改常量时需同步检查所有使用位置。
 */

import type { ModelType, ImageModelType, ChatModelType, ApiFormat, ModelCategory } from './types'

// ==================== 模型类型列表 ====================

/**
 * 所有绘图模型类型列表
 * - 使用场景：
 *   - settings.vue: 模型配置表单的模型类型下拉选项
 *   - index.post.ts: 创建任务时验证 modelType 参数
 */
export const IMAGE_MODEL_TYPES: ImageModelType[] = [
  'midjourney',
  'gemini',
  'flux',
  'dalle',
  'doubao',
  'gpt4o-image',
  'grok-image',
  'qwen-image',
]

/**
 * 所有对话模型类型列表
 * - 使用场景：
 *   - settings.vue: 模型配置表单的模型类型下拉选项（对话分类）
 */
export const CHAT_MODEL_TYPES: ChatModelType[] = [
  'gpt',
  'claude',
  'gemini-chat',
  'deepseek',
  'qwen-chat',
  'grok',
  'llama',
  'moonshot',
  'glm',
  'doubao-chat',
  'minimax',
  'hunyuan',
  'mixtral',
  'phi',
]

/**
 * 所有模型类型列表（绘图 + 对话）
 * - 使用场景：
 *   - settings.vue: 检查是否已添加所有模型类型
 */
export const ALL_MODEL_TYPES: ModelType[] = [...IMAGE_MODEL_TYPES, ...CHAT_MODEL_TYPES]

/**
 * 所有 API 格式列表
 * - 使用场景：
 *   - index.post.ts: 创建任务时验证 apiFormat 参数
 */
export const API_FORMATS: ApiFormat[] = ['mj-proxy', 'gemini', 'dalle', 'openai-chat']

// ==================== 模型类型与 API 格式映射 ====================

/**
 * 模型类型对应的可用 API 格式
 * - 用途：根据选择的模型类型，确定可选的 API 格式
 * - 使用场景：
 *   - settings.vue: 模型配置表单中，切换模型类型时更新可用的 API 格式下拉选项
 *   - DrawingPanel.vue: 可用于校验选择的格式是否匹配模型类型
 */
export const MODEL_API_FORMAT_OPTIONS: Record<ModelType, ApiFormat[]> = {
  // 绘图模型
  'midjourney': ['mj-proxy'],
  'gemini': ['gemini', 'openai-chat'],
  'flux': ['dalle'],
  'dalle': ['dalle'],
  'doubao': ['dalle'],
  'gpt4o-image': ['openai-chat'],
  'grok-image': ['openai-chat'],
  'qwen-image': ['openai-chat'],
  // 对话模型（均使用 OpenAI Chat 格式）
  'gpt': ['openai-chat'],
  'claude': ['openai-chat'],
  'gemini-chat': ['openai-chat'],
  'deepseek': ['openai-chat'],
  'qwen-chat': ['openai-chat'],
  'grok': ['openai-chat'],
  'llama': ['openai-chat'],
  'moonshot': ['openai-chat'],
  'glm': ['openai-chat'],
  'doubao-chat': ['openai-chat'],
  'minimax': ['openai-chat'],
  'hunyuan': ['openai-chat'],
  'mixtral': ['openai-chat'],
  'phi': ['openai-chat'],
}

/**
 * 模型类型对应的分类
 * - 用途：根据模型类型确定其分类（绘图/对话）
 * - 使用场景：
 *   - settings.vue: 切换模型类型时自动更新分类字段
 */
export const MODEL_CATEGORY_MAP: Record<ModelType, ModelCategory> = {
  // 绘图模型
  'midjourney': 'image',
  'gemini': 'image',
  'flux': 'image',
  'dalle': 'image',
  'doubao': 'image',
  'gpt4o-image': 'image',
  'grok-image': 'image',
  'qwen-image': 'image',
  // 对话模型
  'gpt': 'chat',
  'claude': 'chat',
  'gemini-chat': 'chat',
  'deepseek': 'chat',
  'qwen-chat': 'chat',
  'grok': 'chat',
  'llama': 'chat',
  'moonshot': 'chat',
  'glm': 'chat',
  'doubao-chat': 'chat',
  'minimax': 'chat',
  'hunyuan': 'chat',
  'mixtral': 'chat',
  'phi': 'chat',
}

// ==================== 默认模型名称 ====================

/**
 * 各模型类型的默认模型名称（发送给上游的标识符）
 * - 用途：创建模型配置时的默认值，以及服务层调用时的 fallback
 * - 使用场景：
 *   - settings.vue: 切换模型类型时自动填充模型名称输入框
 *   - gemini.ts: generateImage/generateImageWithRef 的默认 modelName 参数
 *   - dalle.ts: generateImage/generateImageWithRef 的默认 modelName 参数
 *   - openaiChat.ts: generateImage/generateImageWithRef 的默认 modelName 参数
 *   - task.ts: submitToGemini/submitToDalle/submitToOpenAIChat 的 fallback 模型名
 */
export const DEFAULT_MODEL_NAMES: Record<ModelType, string> = {
  // 绘图模型
  'midjourney': '',  // MJ 不需要指定模型名
  'gemini': 'gemini-2.5-flash-image',
  'flux': 'flux-dev',
  'dalle': 'dall-e-3',
  'doubao': 'doubao-seedream-3-0-t2i-250415',
  'gpt4o-image': 'gpt-4o-image',
  'grok-image': 'grok-4',
  'qwen-image': 'qwen-image',
  // 对话模型
  'gpt': 'gpt-4o',
  'claude': 'claude-sonnet-4-20250514',
  'gemini-chat': 'gemini-2.5-flash',
  'deepseek': 'deepseek-chat',
  'qwen-chat': 'qwen-max',
  'grok': 'grok-3',
  'llama': 'llama-3.3-70b-instruct-fp8-fast',
  'moonshot': 'moonshot-v1-128k',
  'glm': 'glm-4.5',
  'doubao-chat': 'doubao-1-5-pro-256k-250115',
  'minimax': 'minimax-m1-80k',
  'hunyuan': 'hunyuan-t1',
  'mixtral': 'mixtral-8x22b',
  'phi': 'phi-4',
}

// ==================== 默认预计时间 ====================

/**
 * 各绘图模型类型的默认预计生成时间（秒）
 * - 用途：初次创建配置时的默认值，进度条显示的 fallback
 * - 使用场景：
 *   - settings.vue: 创建模型配置时自动填充预计时间
 *   - TaskCard.vue: 计算进度条百分比时的 fallback（当 modelConfig 无此字段时）
 * - 注意：对话模型无此需求，故使用 Partial 类型
 */
export const DEFAULT_ESTIMATED_TIMES: Record<ImageModelType, number> = {
  'midjourney': 60,
  'gemini': 15,
  'flux': 20,
  'dalle': 15,
  'doubao': 15,
  'gpt4o-image': 30,
  'grok-image': 30,
  'qwen-image': 30,
}

/**
 * 默认预计时间（当无法获取具体模型配置时使用）
 * - 使用场景：
 *   - TaskCard.vue: estimatedTime computed 的最终 fallback
 */
export const DEFAULT_FALLBACK_ESTIMATED_TIME = 60

// ==================== UI 显示用常量 ====================

/**
 * 模型类型的中文显示名称
 * - 用途：在 UI 中展示模型类型的友好名称
 * - 使用场景：
 *   - settings.vue: 模型配置列表、模型类型下拉选项
 *   - DrawingPanel.vue: 模型选择按钮的文本
 *   - TaskCard.vue: 任务详情弹窗中的模型类型显示
 */
export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  // 绘图模型
  'midjourney': 'Midjourney',
  'gemini': 'Gemini 绘图',
  'flux': 'Flux',
  'dalle': 'DALL-E',
  'doubao': '豆包绘图',
  'gpt4o-image': 'GPT-4o 绘图',
  'grok-image': 'Grok 绘图',
  'qwen-image': '通义万相',
  // 对话模型
  'gpt': 'GPT',
  'claude': 'Claude',
  'gemini-chat': 'Gemini',
  'deepseek': 'DeepSeek',
  'qwen-chat': '通义千问',
  'grok': 'Grok',
  'llama': 'LLaMA',
  'moonshot': 'Kimi',
  'glm': '智谱GLM',
  'doubao-chat': '豆包',
  'minimax': 'MiniMax',
  'hunyuan': '混元',
  'mixtral': 'Mixtral',
  'phi': 'Phi',
}

/**
 * API 格式的中文显示名称
 * - 用途：在 UI 中展示 API 格式的友好名称
 * - 使用场景：
 *   - settings.vue: API 格式下拉选项
 *   - DrawingPanel.vue: 当前模型信息显示
 *   - TaskCard.vue: 任务详情弹窗中的请求格式显示
 */
export const API_FORMAT_LABELS: Record<ApiFormat, string> = {
  'mj-proxy': 'MJ-Proxy',
  'gemini': 'Gemini API',
  'dalle': 'DALL-E API',
  'openai-chat': 'OpenAI Chat',
}

/**
 * 模型分类的中文显示名称
 * - 用途：在 UI 中展示模型分类
 * - 使用场景：
 *   - settings.vue: 模型配置列表中区分绘图/对话
 */
export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  'image': '绘图',
  'chat': '对话',
}

/**
 * 模型类型对应的图标（heroicons 图标名）
 * - 用途：在模型选择按钮旁显示图标
 * - 使用场景：
 *   - DrawingPanel.vue: 模型选择按钮的图标
 */
export const MODEL_TYPE_ICONS: Record<ImageModelType, string> = {
  'midjourney': 'i-heroicons-sparkles',
  'gemini': 'i-heroicons-cpu-chip',
  'flux': 'i-heroicons-bolt',
  'dalle': 'i-heroicons-photo',
  'doubao': 'i-heroicons-fire',
  'gpt4o-image': 'i-heroicons-chat-bubble-left-right',
  'grok-image': 'i-heroicons-rocket-launch',
  'qwen-image': 'i-heroicons-cloud',
}

/**
 * 任务卡片中模型类型的显示配置（简短标签 + 颜色）
 * - 用途：任务卡片左下角的模型标签
 * - 使用场景：
 *   - TaskCard.vue: 模型标签的文本和背景色
 */
export const TASK_CARD_MODEL_DISPLAY: Record<ImageModelType, { label: string; color: string }> = {
  'midjourney': { label: 'MJ', color: 'bg-purple-500/80' },
  'gemini': { label: 'Gemini', color: 'bg-blue-500/80' },
  'flux': { label: 'Flux', color: 'bg-orange-500/80' },
  'dalle': { label: 'DALL-E', color: 'bg-green-500/80' },
  'doubao': { label: '豆包', color: 'bg-cyan-500/80' },
  'gpt4o-image': { label: 'GPT-4o', color: 'bg-emerald-500/80' },
  'grok-image': { label: 'Grok', color: 'bg-red-500/80' },
  'qwen-image': { label: '通义', color: 'bg-violet-500/80' },
}

/**
 * 模型使用提示信息
 * - 用途：在绘图面板选择模型后，显示该模型的使用提示
 * - 使用场景：
 *   - DrawingPanel.vue: 模型选择后的提示信息区域
 */
export const MODEL_USAGE_HINTS: Record<ImageModelType, { text: string; type: 'warning' | 'info' }> = {
  'midjourney': { text: '支持 U/V 操作、图片混合、垫图等完整功能', type: 'info' },
  'gemini': { text: '支持多轮对话式图像编辑，垫图效果较好', type: 'info' },
  'flux': { text: '仅 flux-kontext-{max, pro} 支持垫图', type: 'warning' },
  'dalle': { text: 'DALL-E 3 API 不支持垫图功能', type: 'warning' },
  'doubao': { text: '字节跳动图像生成模型，中文理解能力强', type: 'info' },
  'gpt4o-image': { text: '基于 GPT-4o 的图像生成，支持复杂指令', type: 'info' },
  'grok-image': { text: 'xAI 图像生成模型，风格多样，响应快速', type: 'info' },
  'qwen-image': { text: '阿里通义万相，中文提示词效果好', type: 'info' },
}

/**
 * 不支持垫图（参考图）的模型列表
 * - 用途：判断是否显示参考图上传区域
 * - 使用场景：
 *   - DrawingPanel.vue: supportsReferenceImages computed 计算
 */
export const MODELS_WITHOUT_REFERENCE_IMAGE: ImageModelType[] = ['dalle']

// ==================== 图片上传限制 ====================

/**
 * 单张参考图最大文件大小（字节）
 * - 使用场景：
 *   - DrawingPanel.vue: handleFileChange 中校验上传文件大小
 */
export const MAX_REFERENCE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  // 10MB

/**
 * 最大参考图数量
 * - 使用场景：
 *   - DrawingPanel.vue: 限制参考图数组长度、控制上传按钮显示
 */
export const MAX_REFERENCE_IMAGE_COUNT = 3

// ==================== 进度条配置 ====================

/**
 * 进度条更新间隔（毫秒）
 * - 使用场景：
 *   - TaskCard.vue: 进度条计时器的 setInterval 间隔
 */
export const PROGRESS_UPDATE_INTERVAL_MS = 500

/**
 * 进度条时间缓冲系数
 * - 用途：预计时间乘以此系数，避免进度条过早到达 100%
 * - 使用场景：
 *   - TaskCard.vue: progressPercent computed 计算
 */
export const PROGRESS_TIME_BUFFER_RATIO = 1.1

// ==================== Sqids 配置 ====================

/**
 * Sqids 编码使用的字符表
 * - 移除了容易混淆的字符：0O1lI
 * - 使用场景：
 *   - server/utils/sqids.ts: Sqids 实例化配置
 *   - app/utils/sqids.ts: Sqids 实例化配置
 */
export const SQIDS_ALPHABET = 'wNEBY3eVubF4xJRZSvPprtKQdck79C2Hhs6g8yWfUAzTaXGMjmnqD5'

/**
 * Sqids 编码最小长度
 * - 使用场景：
 *   - server/utils/sqids.ts: Sqids 实例化配置
 *   - app/utils/sqids.ts: Sqids 实例化配置
 */
export const SQIDS_MIN_LENGTH = 6

// ==================== 模型名称匹配规则 ====================

/**
 * 对话模型类型的关键词匹配规则
 * - 用途：根据用户输入的模型名称自动推断模型类型
 * - 使用场景：
 *   - settings/[id].vue: 对话模型名称输入时自动匹配类型
 * - 规则：按顺序匹配，第一个匹配的规则生效
 */
export const CHAT_MODEL_MATCH_RULES: { type: ChatModelType; patterns: RegExp[] }[] = [
  {
    type: 'gpt',
    patterns: [
      /^gpt/i,
      /^chatgpt/i,
      /^o[134]-/i,  // o1-preview, o3-mini, o4-mini 等
      /^o[134]$/i,   // 纯 o1, o3, o4
    ],
  },
  {
    type: 'claude',
    patterns: [
      /claude/i,
    ],
  },
  {
    type: 'gemini-chat',
    patterns: [
      /^gemini/i,
    ],
  },
  {
    type: 'deepseek',
    patterns: [
      /deepseek/i,
    ],
  },
  {
    type: 'qwen-chat',
    patterns: [
      /^qwen/i,
      /^qwq/i,      // QWQ 推理模型
      /tongyi/i,
      /通义/,
    ],
  },
  {
    type: 'grok',
    patterns: [
      /^grok/i,
    ],
  },
  {
    type: 'llama',
    patterns: [
      /^llama/i,
    ],
  },
  {
    type: 'moonshot',
    patterns: [
      /^moonshot/i,
      /^kimi/i,
    ],
  },
  {
    type: 'glm',
    patterns: [
      /^glm/i,
    ],
  },
  {
    type: 'doubao-chat',
    patterns: [
      /^doubao/i,
    ],
  },
  {
    type: 'minimax',
    patterns: [
      /^minimax/i,
      /^MiniMax/,
    ],
  },
  {
    type: 'hunyuan',
    patterns: [
      /^hunyuan/i,
      /混元/,
    ],
  },
  {
    type: 'mixtral',
    patterns: [
      /^mixtral/i,
    ],
  },
  {
    type: 'phi',
    patterns: [
      /^phi/i,
      /^Phi/,
    ],
  },
]

/**
 * 根据模型名称推断对话模型类型
 * @param modelName 用户输入的模型名称
 * @returns 匹配的模型类型，如果未匹配则返回 null
 */
export function inferChatModelType(modelName: string): ChatModelType | null {
  if (!modelName?.trim()) return null

  const name = modelName.trim()
  for (const rule of CHAT_MODEL_MATCH_RULES) {
    if (rule.patterns.some(pattern => pattern.test(name))) {
      return rule.type
    }
  }
  return null
}

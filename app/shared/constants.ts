/**
 * 共享常量定义
 *
 * 本文件定义前后端共用的常量，每个常量都标注了使用场景。
 * 修改常量时需同步检查所有使用位置。
 */

import type { ModelType, ImageModelType, ChatModelType, VideoModelType, ApiFormat, ModelCategory } from './types'

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
  'gpt-image',
  'sora-image',
  'grok-image',
  'qwen-image',
  'z-image',
  'koukoutu',
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
 * 所有视频模型类型列表
 * - 使用场景：
 *   - settings.vue: 模型配置表单的模型类型下拉选项（视频分类）
 */
export const VIDEO_MODEL_TYPES: VideoModelType[] = [
  'jimeng-video',
  'veo',
  'sora',
  'grok-video',
]

/**
 * 所有模型类型列表（绘图 + 对话 + 视频）
 * - 使用场景：
 *   - settings.vue: 检查是否已添加所有模型类型
 */
export const ALL_MODEL_TYPES: ModelType[] = [...IMAGE_MODEL_TYPES, ...CHAT_MODEL_TYPES, ...VIDEO_MODEL_TYPES]

/**
 * 模型分类选项
 * - 使用场景：模型编辑表单的分类下拉选项
 */
export const MODEL_CATEGORY_OPTIONS: { label: string; value: ModelCategory }[] = [
  { label: '对话', value: 'chat' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
]

/**
 * 所有 API 格式列表
 * - 使用场景：
 *   - index.post.ts: 创建任务时验证 apiFormat 参数
 */
export const API_FORMATS: ApiFormat[] = ['mj-proxy', 'gemini', 'dalle', 'openai-chat', 'claude', 'koukoutu', 'video-unified']

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
  'gpt-image': ['openai-chat'],
  'sora-image': ['openai-chat'],
  'grok-image': ['openai-chat'],
  'qwen-image': ['openai-chat'],
  'z-image': ['dalle'],
  'koukoutu': ['koukoutu'],
  // 对话模型（支持 OpenAI Chat 和 Claude 格式）
  'gpt': ['openai-chat', 'claude'],
  'claude': ['openai-chat', 'claude'],
  'gemini-chat': ['openai-chat', 'claude', 'gemini'],
  'deepseek': ['openai-chat', 'claude'],
  'qwen-chat': ['openai-chat', 'claude'],
  'grok': ['openai-chat', 'claude'],
  'llama': ['openai-chat', 'claude'],
  'moonshot': ['openai-chat', 'claude'],
  'glm': ['openai-chat', 'claude'],
  'doubao-chat': ['openai-chat', 'claude'],
  'minimax': ['openai-chat', 'claude'],
  'hunyuan': ['openai-chat', 'claude'],
  'mixtral': ['openai-chat', 'claude'],
  'phi': ['openai-chat', 'claude'],
  // 视频模型
  'jimeng-video': ['video-unified'],
  'veo': ['video-unified'],
  'sora': ['video-unified'],
  'grok-video': ['video-unified'],
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
  'gpt-image': 'image',
  'sora-image': 'image',
  'grok-image': 'image',
  'qwen-image': 'image',
  'z-image': 'image',
  'koukoutu': 'image',
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
  // 视频模型
  'jimeng-video': 'video',
  'veo': 'video',
  'sora': 'video',
  'grok-video': 'video',
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
  'midjourney': 'midjourney',  // MJ 实际不需要模型名，但需要一个默认值用于显示和判断
  'gemini': 'gemini-2.5-flash-image',
  'flux': 'flux-dev',
  'dalle': 'dall-e-3',
  'doubao': 'doubao-seedream-3-0-t2i-250415',
  'gpt4o-image': 'gpt-4o',
  'gpt-image': 'gpt-image-1.5-all',
  'sora-image': 'sora_image',
  'grok-image': 'grok-4',
  'qwen-image': 'qwen-image',
  'z-image': 'z-image-turbo',
  'koukoutu': 'background-removal',
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
  // 视频模型
  'jimeng-video': 'jimeng-video-3.0',
  'veo': 'veo3.1-fast',
  'sora': 'sora-2',
  'grok-video': 'grok-video-3',
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
  'gpt-image': 30,
  'sora-image': 30,
  'grok-image': 30,
  'qwen-image': 30,
  'z-image': 15,
  'koukoutu': 10,
}

/**
 * 默认预计时间（当无法获取具体模型配置时使用）
 * - 使用场景：
 *   - TaskCard.vue: estimatedTime computed 的最终 fallback
 */
export const DEFAULT_FALLBACK_ESTIMATED_TIME = 60

/**
 * 各视频模型类型的默认预计生成时间（秒）
 * - 用途：初次创建配置时的默认值，进度条显示的 fallback
 * - 使用场景：
 *   - settings.vue: 创建视频模型配置时自动填充预计时间
 *   - VideoCard.vue: 计算进度条百分比时的 fallback
 */
export const DEFAULT_VIDEO_ESTIMATED_TIMES: Record<VideoModelType, number> = {
  'jimeng-video': 120,
  'veo': 180,
  'sora': 180,
  'grok-video': 120,
}

// ==================== 预计时间更新逻辑说明 ====================
//
// 预计时间存储在 ModelTypeConfig.estimatedTime 字段中，用户可在模型配置页面自定义。
//
// 【绘图模型】预计生成时间
// - 含义：从任务创建到图片生成完成的预计耗时
// - 显示：TaskCard.vue 进度条，根据 elapsed / estimatedTime 计算百分比
// - 优先级：modelConfig.estimatedTime > DEFAULT_ESTIMATED_TIMES[modelType] > DEFAULT_FALLBACK_ESTIMATED_TIME
// - 自动更新：任务成功后，用实际耗时更新 estimatedTime（server/services/task.ts updateEstimatedTime）
//
// 【对话模型】预计首字时长
// - 含义：从发送消息到 AI 输出第一个字的预计耗时
// - 显示：MessageList.vue 三个小圆圈后的倒计时（如 "2.35s"），超时后显示 "+1.23s"
// - 优先级：modelConfig.estimatedTime > DEFAULT_CHAT_ESTIMATED_TIMES[modelType] > DEFAULT_CHAT_FALLBACK_ESTIMATED_TIME
// - 自动更新：首字输出后，用实际耗时更新 estimatedTime（server/services/streamingTask.ts）
//
// =============================================================

/**
 * 各对话模型类型的默认预计首字时长（秒）
 * - 用途：AI 回复等待时显示倒计时
 * - 使用场景：
 *   - settings/[id].vue: 创建对话模型配置时自动填充预计时间
 *   - MessageList.vue: 等待 AI 回复时显示预计首字时长倒计时
 */
export const DEFAULT_CHAT_ESTIMATED_TIMES: Record<ChatModelType, number> = {
  'gpt': 2,
  'claude': 3,
  'gemini-chat': 2,
  'deepseek': 3,
  'qwen-chat': 2,
  'grok': 2,
  'llama': 2,
  'moonshot': 3,
  'glm': 2,
  'doubao-chat': 2,
  'minimax': 2,
  'hunyuan': 3,
  'mixtral': 2,
  'phi': 2,
}

/**
 * 默认对话模型首字时长（当无法获取具体模型配置时使用）
 * - 使用场景：
 *   - MessageList.vue: estimatedTime 的最终 fallback
 */
export const DEFAULT_CHAT_FALLBACK_ESTIMATED_TIME = 3

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
  'gpt-image': 'GPT Image',
  'sora-image': 'Sora 绘图',
  'grok-image': 'Grok 绘图',
  'qwen-image': '通义万相',
  'z-image': 'Z-Image',
  'koukoutu': '抠抠图',
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
  // 视频模型
  'jimeng-video': '即梦视频',
  'veo': 'Veo',
  'sora': 'Sora',
  'grok-video': 'Grok 视频',
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
  'claude': 'Claude API',
  'koukoutu': '抠抠图 API',
  'video-unified': '视频统一格式',
  'openai-video': 'OpenAI Video',
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
  'video': '视频',
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
  'gpt-image': 'i-heroicons-photo',
  'sora-image': 'i-heroicons-film',
  'grok-image': 'i-heroicons-rocket-launch',
  'qwen-image': 'i-heroicons-cloud',
  'z-image': 'i-heroicons-cube',
  'koukoutu': 'i-heroicons-scissors',
}

/**
 * 任务卡片中模型类型的显示配置（简短标签 + 颜色）
 * - 用途：任务卡片左下角的模型标签
 * - 使用场景：
 *   - Card.vue: 图片任务卡片模型标签的文本和背景色
 *   - VideoCard.vue: 视频任务卡片模型标签的文本和背景色
 */
export const TASK_CARD_MODEL_DISPLAY: Record<ImageModelType | VideoModelType, { label: string; color: string }> = {
  // 图片模型
  'midjourney': { label: 'MJ', color: 'bg-purple-500/80' },
  'gemini': { label: 'Gemini', color: 'bg-blue-500/80' },
  'flux': { label: 'Flux', color: 'bg-orange-500/80' },
  'dalle': { label: 'DALL-E', color: 'bg-green-500/80' },
  'doubao': { label: '豆包', color: 'bg-cyan-500/80' },
  'gpt4o-image': { label: 'GPT-4o', color: 'bg-emerald-500/80' },
  'gpt-image': { label: 'GPT', color: 'bg-lime-500/80' },
  'sora-image': { label: 'Sora', color: 'bg-amber-500/80' },
  'grok-image': { label: 'Grok', color: 'bg-red-500/80' },
  'qwen-image': { label: '通义', color: 'bg-violet-500/80' },
  'z-image': { label: 'Z-Image', color: 'bg-indigo-500/80' },
  'koukoutu': { label: '抠图', color: 'bg-pink-500/80' },
  // 视频模型
  'jimeng-video': { label: '即梦', color: 'bg-teal-500/80' },
  'veo': { label: 'Veo', color: 'bg-rose-500/80' },
  'sora': { label: 'Sora', color: 'bg-amber-500/80' },
  'grok-video': { label: 'Grok', color: 'bg-red-500/80' },
}

/**
 * 不支持垫图（参考图）的模型列表
 * - 用途：判断是否显示参考图上传区域
 * - 使用场景：
 *   - DrawingPanel.vue: supportsReferenceImages computed 计算
 */
export const MODELS_WITHOUT_REFERENCE_IMAGE: ImageModelType[] = ['dalle', 'z-image']

/**
 * 支持负面提示词的模型列表
 * - 用途：判断是否显示负面提示词输入框
 * - 使用场景：
 *   - Workbench.vue: supportsNegativePrompt computed 计算
 */
export const MODELS_WITH_NEGATIVE_PROMPT: ImageModelType[] = ['flux', 'doubao', 'z-image']

/**
 * 支持尺寸参数的模型列表
 * - 用途：判断是否显示尺寸选择控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示尺寸选择
 */
export const MODELS_WITH_SIZE: ImageModelType[] = ['dalle', 'doubao', 'gpt4o-image']

/**
 * 支持质量参数的模型列表
 * - 用途：判断是否显示质量选择控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示质量选择
 */
export const MODELS_WITH_QUALITY: ImageModelType[] = ['dalle', 'gpt4o-image']

/**
 * 支持风格参数的模型列表
 * - 用途：判断是否显示风格选择控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示风格选择
 */
export const MODELS_WITH_STYLE: ImageModelType[] = ['dalle']

/**
 * 支持宽高比参数的模型列表
 * - 用途：判断是否显示宽高比选择控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示宽高比选择
 */
export const MODELS_WITH_ASPECT_RATIO: ImageModelType[] = ['flux']

/**
 * 支持随机种子参数的模型列表
 * - 用途：判断是否显示种子输入控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示种子输入
 */
export const MODELS_WITH_SEED: ImageModelType[] = ['doubao']

/**
 * 支持提示词相关度参数的模型列表
 * - 用途：判断是否显示 guidance_scale 控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示提示词相关度
 */
export const MODELS_WITH_GUIDANCE: ImageModelType[] = ['doubao']

/**
 * 支持水印参数的模型列表
 * - 用途：判断是否显示水印开关控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示水印开关
 */
export const MODELS_WITH_WATERMARK: ImageModelType[] = ['doubao']

/**
 * 支持背景透明度参数的模型列表
 * - 用途：判断是否显示背景选择控件
 * - 使用场景：
 *   - ImageForm.vue: 根据模型类型显示背景选择
 */
export const MODELS_WITH_BACKGROUND: ImageModelType[] = ['gpt4o-image']

// ==================== 思考功能配置 ====================

/**
 * 支持思考功能的对话模型类型列表
 * - 使用 OpenAI 格式的 reasoning_effort 参数
 */
export const CHAT_MODELS_WITH_THINKING: ChatModelType[] = ['claude', 'gpt']

/**
 * OpenAI 推理模型默认 effort 级别
 * - low: 低推理深度
 * - medium: 中等推理深度（推荐）
 * - high: 高推理深度
 */
export const OPENAI_REASONING_EFFORT = 'medium' as const

/**
 * Claude 思考功能 budget_tokens 默认值
 * 参考: https://docs.anthropic.com/claude/docs/extended-thinking
 */
export const CLAUDE_THINKING_BUDGET_TOKENS = 10000 as const

/**
 * Gemini 思考功能 thinkingBudget 默认值
 * 参考: https://ai.google.dev/gemini-api/docs/thinking
 */
export const GEMINI_THINKING_BUDGET = 8000 as const

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

// ==================== 用户设置默认值 ====================

/**
 * 用户设置键名枚举
 */
export const USER_SETTING_KEYS = {
  // Prompt 设置
  PROMPT_COMPRESS: 'prompt.compress',
  PROMPT_GENERATE_TITLE: 'prompt.generateTitle',
  PROMPT_SUGGESTIONS: 'prompt.suggestions',
  PROMPT_OPTIMIZE: 'prompt.optimize',
  // 通用设置
  GENERAL_BLUR_BY_DEFAULT: 'general.blurByDefault',
  GENERAL_COMPRESS_KEEP_COUNT: 'general.compressKeepCount',
  GENERAL_TITLE_MAX_LENGTH: 'general.titleMaxLength',
  GENERAL_SUGGESTIONS_COUNT: 'general.suggestionsCount',
  // 绘图设置（仅保存 aimodelId）
  DRAWING_AI_OPTIMIZE_AIMODEL_ID: 'drawing.aiOptimizeAimodelId',
  DRAWING_EMBEDDED_AIMODEL_ID: 'drawing.embeddedAimodelId',
  DRAWING_WORKBENCH_AIMODEL_ID: 'drawing.workbenchAimodelId',
  // 视频设置
  VIDEO_WORKBENCH_AIMODEL_ID: 'video.workbenchAimodelId',
} as const

export type UserSettingKey = typeof USER_SETTING_KEYS[keyof typeof USER_SETTING_KEYS]

/**
 * 默认对话压缩 Prompt
 * 占位符：{messages} - 待压缩的历史消息内容
 */
export const DEFAULT_COMPRESS_PROMPT = `请将以下对话内容压缩为一份详细的摘要（约500-1000字），需要保留：
1. 讨论的主要话题和结论
2. 重要的技术细节、代码片段或配置信息
3. 用户的关键需求和偏好
4. 待解决的问题或后续任务

{messages}

直接输出摘要内容，不要加标题或格式说明。`

/**
 * 默认标题生成 Prompt
 * 占位符：{context} - 对话上下文（前2条+后2条消息）
 */
export const DEFAULT_GENERATE_TITLE_PROMPT = `请根据以下对话内容，生成一个简洁的对话标题（10-20个字），直接输出标题，不要加引号或其他格式。

{context}`

/**
 * 默认开场白建议 Prompt
 * 占位符：{time} - 当前时间
 */
export const DEFAULT_SUGGESTIONS_PROMPT = `现在用户开始了一次新对话，当前时间是 {time}。请根据你的角色定位，为用户提供开场白建议，帮助用户快速开始对话。
要求：
1. 每条建议简洁明了，10-30 字
2. 建议应该多样化，覆盖不同场景
3. 以 JSON 数组格式返回，例如：["问题1", "问题2", "问题3"]
4. 直接输出 JSON，不要加其他说明`

/**
 * 默认提示词优化 Prompt
 * 占位符：{modelInfo} - 目标模型信息（可选）
 */
export const DEFAULT_OPTIMIZE_PROMPT = `你是一个专业的 AI 绘图提示词优化专家。你的任务是将用户提供的简单描述优化为更详细、更专业的绘图提示词。
{modelInfo}
优化规则：
1. 保持原始描述的核心意图
2. 添加适当的艺术风格描述（如：油画、水彩、数字艺术等）
3. 添加光影、构图、色彩等专业描述
4. 添加质量相关的关键词（如：高清、细节丰富、8K等）
5. 使用英文输出，因为大多数 AI 绘图模型对英文提示词效果更好
6. 保持提示词简洁，避免过于冗长（建议 50-150 词）
7. 如果目标模型支持负面提示词（如 Flux、Stable Diffusion），可以提供负面提示词

输出格式（JSON）：
{
  "prompt": "优化后的正向提示词",
  "negativePrompt": "负面提示词（可选，仅当模型支持时提供）"
}

只输出 JSON，不要加任何解释或 markdown 代码块标记。`

/**
 * 用户设置值类型
 */
export type UserSettingValue = string | number | boolean

/**
 * 用户设置默认值
 */
export const USER_SETTING_DEFAULTS: Record<UserSettingKey, UserSettingValue> = {
  [USER_SETTING_KEYS.PROMPT_COMPRESS]: DEFAULT_COMPRESS_PROMPT,
  [USER_SETTING_KEYS.PROMPT_GENERATE_TITLE]: DEFAULT_GENERATE_TITLE_PROMPT,
  [USER_SETTING_KEYS.PROMPT_SUGGESTIONS]: DEFAULT_SUGGESTIONS_PROMPT,
  [USER_SETTING_KEYS.PROMPT_OPTIMIZE]: DEFAULT_OPTIMIZE_PROMPT,
  [USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT]: true,
  [USER_SETTING_KEYS.GENERAL_COMPRESS_KEEP_COUNT]: 4,
  [USER_SETTING_KEYS.GENERAL_TITLE_MAX_LENGTH]: 30,
  [USER_SETTING_KEYS.GENERAL_SUGGESTIONS_COUNT]: 5,
  // 绘图设置默认值（0 表示未设置，使用系统默认）
  [USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID]: 0,
  [USER_SETTING_KEYS.DRAWING_EMBEDDED_AIMODEL_ID]: 0,
  [USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID]: 0,
  // 视频设置默认值
  [USER_SETTING_KEYS.VIDEO_WORKBENCH_AIMODEL_ID]: 0,
}

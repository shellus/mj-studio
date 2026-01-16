/**
 * 模型推断逻辑
 * 从模型 ID 推断分类、能力、API 格式等信息
 */

import type { ModelCategory, ModelCapability, ApiFormat, ModelType } from './types'

// ==================== 推断结果类型 ====================

export interface InferredModelInfo {
  category: ModelCategory
  group: string
  capabilities: ModelCapability[]
  apiFormat: ApiFormat
  modelType: ModelType
}

// ==================== 厂商分组推断 ====================

// 厂商匹配规则（按顺序匹配，更具体的规则放前面）
const VENDOR_RULES: [RegExp, string][] = [
  // OpenAI 系列
  [/\b(gpt|o1|o3|o4|dall-e|sora)\b/i, 'OpenAI'],
  [/gpt-image/i, 'OpenAI'],
  [/openai/i, 'OpenAI'],

  // Anthropic
  [/claude/i, 'Anthropic'],
  [/anthropic/i, 'Anthropic'],

  // Google
  [/gemini/i, 'Google'],
  [/gemma/i, 'Google'],
  [/palm/i, 'Google'],
  [/bison/i, 'Google'],
  [/\bveo\b/i, 'Google'],

  // 阿里
  [/(qwen|qwq|qvq|wan-)/i, '阿里'],

  // 字节跳动
  [/doubao/i, '字节跳动'],
  [/seedream/i, '字节跳动'],
  [/jimeng/i, '字节跳动'],
  [/bytedance/i, '字节跳动'],

  // 深度求索
  [/deepseek/i, 'DeepSeek'],

  // 智谱
  [/glm/i, '智谱'],
  [/cogview/i, '智谱'],
  [/zhipu/i, '智谱'],

  // MiniMax
  [/abab/i, 'MiniMax'],
  [/minimax/i, 'MiniMax'],
  [/hailuo/i, 'MiniMax'],

  // 月之暗面
  [/moonshot/i, '月之暗面'],
  [/kimi/i, '月之暗面'],

  // 腾讯
  [/hunyuan/i, '腾讯'],

  // xAI
  [/grok/i, 'xAI'],

  // Meta
  [/llama/i, 'Meta'],

  // Mistral
  [/mixtral/i, 'Mistral'],
  [/mistral/i, 'Mistral'],
  [/codestral/i, 'Mistral'],
  [/ministral/i, 'Mistral'],
  [/magistral/i, 'Mistral'],
  [/pixtral/i, 'Mistral'],

  // 零一万物
  [/yi-/i, '零一万物'],

  // 百川
  [/baichuan/i, '百川'],

  // 阶跃星辰
  [/step/i, '阶跃星辰'],

  // Microsoft
  [/phi/i, 'Microsoft'],
  [/copilot/i, 'Microsoft'],

  // Stability AI
  [/stable-/i, 'Stability'],
  [/sdxl/i, 'Stability'],
  [/flux/i, 'Black Forest'],

  // Midjourney
  [/midjourney/i, 'Midjourney'],
  [/mj-/i, 'Midjourney'],

  // Cohere
  [/cohere/i, 'Cohere'],
  [/command/i, 'Cohere'],

  // 讯飞
  [/sparkdesk/i, '讯飞'],

  // Perplexity
  [/perplexity/i, 'Perplexity'],
  [/sonar/i, 'Perplexity'],

  // Luma
  [/luma/i, 'Luma'],

  // 快手可灵
  [/keling/i, '快手'],
  [/kling/i, '快手'],

  // 生数科技
  [/vidu-/i, '生数科技'],

  // Suno
  [/suno/i, 'Suno'],
  [/chirp/i, 'Suno'],

  // AI21
  [/ai21/i, 'AI21'],
  [/jamba-/i, 'AI21'],

  // NVIDIA
  [/nvidia/i, 'NVIDIA'],

  // Jina
  [/jina/i, 'Jina'],

  // 360
  [/360/i, '360'],

  // 面壁智能
  [/minicpm/i, '面壁智能'],

  // 书生
  [/internlm/i, '书生'],
  [/internvl/i, '书生'],

  // 文心
  [/ernie-/i, '百度'],
]

/**
 * 从模型 ID 推断厂商分组
 */
export function getModelGroup(modelId: string): string {
  if (!modelId) return '其他'

  for (const [pattern, vendor] of VENDOR_RULES) {
    if (pattern.test(modelId)) {
      return vendor
    }
  }

  return '其他'
}

// ==================== 分类推断 ====================

const IMAGE_MODEL_PATTERNS = [
  /dall-e/i,
  /gpt-image/i,
  /flux/i,
  /stable-?diffusion/i,
  /midjourney/i,
  /\bmj-/i,
  /cogview/i,
  /imagen/i,
  /z-image/i,
  /seedream/i,
  /kandinsky/i,
]

const VIDEO_MODEL_PATTERNS = [
  /\bkling/i,
  /\bluma/i,
  /\brunway/i,
  /\bsora\b/i,
  /\bpika/i,
  /\bveo\b/i,
  /jimeng/i,
  /wan2/i,
  /pixverse/i,
]

const EMBEDDING_PATTERNS = [
  /embed/i,
  /bge-/i,
  /\be5-/i,
  /gte-/i,
  /text-embedding/i,
]

/**
 * 推断模型分类
 */
export function inferCategory(modelId: string): ModelCategory {
  // 图片模型
  if (IMAGE_MODEL_PATTERNS.some(p => p.test(modelId))) {
    return 'image'
  }

  // 视频模型
  if (VIDEO_MODEL_PATTERNS.some(p => p.test(modelId))) {
    return 'video'
  }

  // Embedding 模型归类为 chat（暂不单独处理）
  // TTS 模型也归类为 chat

  return 'chat'
}

// ==================== 能力推断 ====================

const VISION_PATTERNS = [
  /gpt-4o/i,
  /gpt-4-turbo/i,
  /gpt-4\.1/i,
  /gpt-4\.5/i,
  /gpt-5/i,
  /claude-3/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /claude-haiku-4/i,
  /gemini-1\.5/i,
  /gemini-2/i,
  /gemini-3/i,
  /qwen-vl/i,
  /qwen2-vl/i,
  /qwen2\.5-vl/i,
  /qwen3-vl/i,
  /\bqvq\b/i,
  /glm-4v/i,
  /deepseek-vl/i,
  /grok-vision/i,
  /grok-4/i,
  /llava/i,
  /minicpm/i,
  /pixtral/i,
]

const REASONING_PATTERNS = [
  /\bo1\b/i,
  /\bo3\b/i,
  /\bo4\b/i,
  /gpt-5/i,
  /\bqwq\b/i,
  /\bqvq\b/i,
  /qwen3.*thinking/i,
  /deepseek-r1/i,
  /deepseek-v3/i,
  /claude-3\.7/i,
  /claude-3-7/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /gemini.*thinking/i,
  /glm-z1/i,
  /glm-4\.5/i,
  /glm-4\.6/i,
  /hunyuan-t1/i,
  /hunyuan-a13b/i,
  /doubao.*thinking/i,
  /doubao-seed/i,
  /grok-3-mini/i,
  /grok-4/i,
  /minimax-m1/i,
  /minimax-m2/i,
]

const FUNCTION_CALLING_PATTERNS = [
  /gpt-4o/i,
  /gpt-4\b/i,
  /gpt-4\.5/i,
  /gpt-5/i,
  /\bo1\b/i,
  /\bo3\b/i,
  /\bo4\b/i,
  /claude/i,
  /\bqwen\b/i,
  /qwen3/i,
  /gemini/i,
  /deepseek/i,
  /glm-4/i,
  /grok-3/i,
  /doubao-seed/i,
  /hunyuan/i,
]

// 排除工具调用的模式
const FUNCTION_CALLING_EXCLUDED = [
  ...EMBEDDING_PATTERNS,
  ...IMAGE_MODEL_PATTERNS,
  /rerank/i,
]

// Web Search 能力匹配规则
const WEB_SEARCH_PATTERNS = [
  // Claude 支持的模型
  /claude-3[.-]5-sonnet/i,
  /claude-3[.-]7-sonnet/i,
  /claude-3[.-]5-haiku/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /claude-haiku-4/i,
  // OpenAI（预留）
  /gpt-4o-search/i,
  /gpt-4\.1(?!-nano)/i,
  // Gemini（预留）
  /gemini-2(?!.*-image)/i,
  /gemini-3/i,
  // Grok
  /grok-[34]/i,
  // Perplexity
  /sonar/i,
  // 阿里云
  /qwen-turbo/i,
  /qwen-max/i,
  /qwen-plus/i,
  /qwq/i,
  /qwen-flash/i,
  /qwen3-max/i,
  // 智谱
  /glm-4-/i,
  // 腾讯混元（排除 lite）
  /hunyuan(?!-lite)/i,
]

/**
 * 推断模型能力
 */
export function inferCapabilities(modelId: string): ModelCapability[] {
  const capabilities: ModelCapability[] = []

  // 排除非对话模型
  if (EMBEDDING_PATTERNS.some(p => p.test(modelId))) {
    return []
  }

  // 视觉能力
  if (VISION_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('vision')
  }

  // 推理能力
  if (REASONING_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('reasoning')
  }

  // 工具调用能力
  const isExcluded = FUNCTION_CALLING_EXCLUDED.some(p => p.test(modelId))
  if (!isExcluded && FUNCTION_CALLING_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('function_calling')
  }

  // Web Search 能力
  if (WEB_SEARCH_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('web_search')
  }

  return capabilities
}

// ==================== API 格式推断 ====================

/**
 * 推断 API 格式
 */
export function inferApiFormat(modelId: string): ApiFormat {
  const id = modelId.toLowerCase()

  if (/midjourney|mj-/.test(id)) return 'mj-proxy'
  if (/dall-e|gpt-image/.test(id)) return 'dalle'
  if (/gemini/.test(id)) return 'gemini'
  if (/claude/.test(id)) return 'claude'
  if (/kling|luma|runway|pika|veo|jimeng/.test(id)) return 'video-unified'
  if (/sora/.test(id)) return 'openai-video'

  return 'openai-chat'
}

// ==================== 模型类型推断 ====================

/**
 * 推断模型类型
 */
export function inferModelType(modelId: string, category: ModelCategory): ModelType {
  const id = modelId.toLowerCase()

  if (category === 'image') {
    if (/midjourney|mj-/.test(id)) return 'midjourney'
    if (/dall-e/.test(id)) return 'dalle'
    if (/gpt-image/.test(id)) return 'gpt-image'
    if (/flux/.test(id)) return 'flux'
    if (/gemini/.test(id)) return 'gemini'
    if (/doubao/.test(id)) return 'doubao'
    if (/grok/.test(id)) return 'grok-image'
    if (/qwen/.test(id)) return 'qwen-image'
    if (/sora/.test(id)) return 'sora-image'
    if (/z-image/.test(id)) return 'z-image'
    return 'dalle' // 默认
  }

  if (category === 'video') {
    if (/jimeng/.test(id)) return 'jimeng-video'
    if (/veo/.test(id)) return 'veo'
    if (/sora/.test(id)) return 'sora'
    if (/grok/.test(id)) return 'grok-video'
    return 'jimeng-video' // 默认
  }

  // chat
  if (/gpt|openai|o1|o3|o4/.test(id)) return 'gpt'
  if (/claude/.test(id)) return 'claude'
  if (/gemini/.test(id)) return 'gemini-chat'
  if (/deepseek/.test(id)) return 'deepseek'
  if (/qwen|qwq|qvq/.test(id)) return 'qwen-chat'
  if (/grok/.test(id)) return 'grok'
  if (/llama/.test(id)) return 'llama'
  if (/moonshot|kimi/.test(id)) return 'moonshot'
  if (/glm/.test(id)) return 'glm'
  if (/doubao/.test(id)) return 'doubao-chat'
  if (/minimax/.test(id)) return 'minimax'
  if (/hunyuan/.test(id)) return 'hunyuan'
  if (/mixtral|mistral/.test(id)) return 'mixtral'
  if (/phi/.test(id)) return 'phi'

  return 'gpt' // 默认
}

// ==================== 主函数 ====================

/**
 * 从模型 ID 推断完整的模型信息
 */
export function inferModelInfo(modelId: string): InferredModelInfo {
  const category = inferCategory(modelId)
  const group = getModelGroup(modelId)
  const capabilities = inferCapabilities(modelId)
  const apiFormat = inferApiFormat(modelId)
  const modelType = inferModelType(modelId, category)

  return {
    category,
    group,
    capabilities,
    apiFormat,
    modelType,
  }
}

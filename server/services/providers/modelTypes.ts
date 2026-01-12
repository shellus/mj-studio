/**
 * ModelType 注册表
 *
 * 存放模型类型的元数据（显示信息、默认配置、参数能力等）。
 * ModelType 与 Provider 是多对多关系，分开管理。
 */

import type { ImageModelType, VideoModelType, ChatModelType, ModelCategory } from './types'

/** 模型参数能力 */
export interface ModelCapabilities {
  referenceImage?: boolean
  negativePrompt?: boolean
  size?: boolean
  quality?: boolean
  style?: boolean
  aspectRatio?: boolean
  seed?: boolean
  guidance?: boolean
  watermark?: boolean
  background?: boolean
  duration?: boolean
  orientation?: boolean
  enhancePrompt?: boolean
  upsample?: boolean
}

/** 模型类型元数据 */
export interface ModelTypeMeta {
  type: ImageModelType | VideoModelType | ChatModelType
  label: string
  category: ModelCategory
  icon?: string
  cardDisplay?: {
    label: string
    color: string
  }
  defaults: {
    modelName: string
    estimatedTime: number
  }
  capabilities?: ModelCapabilities
}

/** 图片模型注册表 */
export const IMAGE_MODEL_REGISTRY: ModelTypeMeta[] = [
  {
    type: 'midjourney',
    label: 'Midjourney',
    category: 'image',
    icon: 'i-heroicons-sparkles',
    cardDisplay: { label: 'MJ', color: 'bg-purple-500/80' },
    defaults: { modelName: 'midjourney', estimatedTime: 60 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'gemini',
    label: 'Gemini 绘图',
    category: 'image',
    icon: 'i-heroicons-cpu-chip',
    cardDisplay: { label: 'Gemini', color: 'bg-blue-500/80' },
    defaults: { modelName: 'gemini-2.5-flash-image', estimatedTime: 15 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'flux',
    label: 'Flux',
    category: 'image',
    icon: 'i-heroicons-bolt',
    cardDisplay: { label: 'Flux', color: 'bg-orange-500/80' },
    defaults: { modelName: 'flux-dev', estimatedTime: 20 },
    capabilities: { referenceImage: true, negativePrompt: true, aspectRatio: true },
  },
  {
    type: 'dalle',
    label: 'DALL-E',
    category: 'image',
    icon: 'i-heroicons-photo',
    cardDisplay: { label: 'DALL-E', color: 'bg-green-500/80' },
    defaults: { modelName: 'dall-e-3', estimatedTime: 15 },
    capabilities: { size: true, quality: true, style: true },
  },
  {
    type: 'doubao',
    label: '豆包绘图',
    category: 'image',
    icon: 'i-heroicons-fire',
    cardDisplay: { label: '豆包', color: 'bg-cyan-500/80' },
    defaults: { modelName: 'doubao-seedream-3-0-t2i-250415', estimatedTime: 15 },
    capabilities: { referenceImage: true, negativePrompt: true, size: true, seed: true, guidance: true, watermark: true },
  },
  {
    type: 'gpt4o-image',
    label: 'GPT-4o 绘图',
    category: 'image',
    icon: 'i-heroicons-chat-bubble-left-right',
    cardDisplay: { label: 'GPT-4o', color: 'bg-emerald-500/80' },
    defaults: { modelName: 'gpt-4o', estimatedTime: 30 },
    capabilities: { referenceImage: true, size: true, quality: true, background: true },
  },
  {
    type: 'gpt-image',
    label: 'GPT Image',
    category: 'image',
    icon: 'i-heroicons-photo',
    cardDisplay: { label: 'GPT', color: 'bg-lime-500/80' },
    defaults: { modelName: 'gpt-image-1.5-all', estimatedTime: 30 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'sora-image',
    label: 'Sora 绘图',
    category: 'image',
    icon: 'i-heroicons-film',
    cardDisplay: { label: 'Sora', color: 'bg-amber-500/80' },
    defaults: { modelName: 'sora_image', estimatedTime: 30 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'grok-image',
    label: 'Grok 绘图',
    category: 'image',
    icon: 'i-heroicons-rocket-launch',
    cardDisplay: { label: 'Grok', color: 'bg-red-500/80' },
    defaults: { modelName: 'grok-4', estimatedTime: 30 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'qwen-image',
    label: '通义万相',
    category: 'image',
    icon: 'i-heroicons-cloud',
    cardDisplay: { label: '通义', color: 'bg-violet-500/80' },
    defaults: { modelName: 'qwen-image', estimatedTime: 30 },
    capabilities: { referenceImage: true },
  },
  {
    type: 'z-image',
    label: 'Z-Image',
    category: 'image',
    icon: 'i-heroicons-cube',
    cardDisplay: { label: 'Z-Image', color: 'bg-indigo-500/80' },
    defaults: { modelName: 'z-image-turbo', estimatedTime: 15 },
    capabilities: { negativePrompt: true },
  },
  {
    type: 'koukoutu',
    label: '抠抠图',
    category: 'image',
    icon: 'i-heroicons-scissors',
    cardDisplay: { label: '抠图', color: 'bg-pink-500/80' },
    defaults: { modelName: 'background-removal', estimatedTime: 10 },
  },
]

/** 视频模型注册表 */
export const VIDEO_MODEL_REGISTRY: ModelTypeMeta[] = [
  {
    type: 'jimeng-video',
    label: '即梦视频',
    category: 'video',
    cardDisplay: { label: '即梦', color: 'bg-teal-500/80' },
    defaults: { modelName: 'jimeng-video-3.0', estimatedTime: 120 },
  },
  {
    type: 'veo',
    label: 'Veo',
    category: 'video',
    cardDisplay: { label: 'Veo', color: 'bg-rose-500/80' },
    defaults: { modelName: 'veo3.1-fast', estimatedTime: 180 },
  },
  {
    type: 'sora',
    label: 'Sora',
    category: 'video',
    cardDisplay: { label: 'Sora', color: 'bg-amber-500/80' },
    defaults: { modelName: 'sora-2', estimatedTime: 180 },
  },
  {
    type: 'grok-video',
    label: 'Grok 视频',
    category: 'video',
    cardDisplay: { label: 'Grok', color: 'bg-red-500/80' },
    defaults: { modelName: 'grok-video-3', estimatedTime: 120 },
  },
]

/** 对话模型注册表 */
export const CHAT_MODEL_REGISTRY: ModelTypeMeta[] = [
  { type: 'gpt', label: 'GPT', category: 'chat', defaults: { modelName: 'gpt-4o', estimatedTime: 2 } },
  { type: 'claude', label: 'Claude', category: 'chat', defaults: { modelName: 'claude-sonnet-4-20250514', estimatedTime: 3 } },
  { type: 'gemini-chat', label: 'Gemini', category: 'chat', defaults: { modelName: 'gemini-2.5-flash', estimatedTime: 2 } },
  { type: 'deepseek', label: 'DeepSeek', category: 'chat', defaults: { modelName: 'deepseek-chat', estimatedTime: 3 } },
  { type: 'qwen-chat', label: '通义千问', category: 'chat', defaults: { modelName: 'qwen-max', estimatedTime: 2 } },
  { type: 'grok', label: 'Grok', category: 'chat', defaults: { modelName: 'grok-3', estimatedTime: 2 } },
  { type: 'llama', label: 'LLaMA', category: 'chat', defaults: { modelName: 'llama-3.3-70b-instruct-fp8-fast', estimatedTime: 2 } },
  { type: 'moonshot', label: 'Kimi', category: 'chat', defaults: { modelName: 'moonshot-v1-128k', estimatedTime: 3 } },
  { type: 'glm', label: '智谱GLM', category: 'chat', defaults: { modelName: 'glm-4.5', estimatedTime: 2 } },
  { type: 'doubao-chat', label: '豆包', category: 'chat', defaults: { modelName: 'doubao-1-5-pro-256k-250115', estimatedTime: 2 } },
  { type: 'minimax', label: 'MiniMax', category: 'chat', defaults: { modelName: 'minimax-m1-80k', estimatedTime: 2 } },
  { type: 'hunyuan', label: '混元', category: 'chat', defaults: { modelName: 'hunyuan-t1', estimatedTime: 3 } },
  { type: 'mixtral', label: 'Mixtral', category: 'chat', defaults: { modelName: 'mixtral-8x22b', estimatedTime: 2 } },
  { type: 'phi', label: 'Phi', category: 'chat', defaults: { modelName: 'phi-4', estimatedTime: 2 } },
]

/** 所有模型注册表 */
export const MODEL_TYPE_REGISTRY: ModelTypeMeta[] = [
  ...IMAGE_MODEL_REGISTRY,
  ...VIDEO_MODEL_REGISTRY,
  ...CHAT_MODEL_REGISTRY,
]

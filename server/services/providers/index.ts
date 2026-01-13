/**
 * Provider 聚合入口
 *
 * 统一管理所有任务类服务（绘图/视频）的 Provider。
 */

import type { Provider, ApiFormat, ProviderMeta, ModelCapabilities, ValidationRules, ImageModelType, VideoModelType } from './types'
export * from './types'
export { MODEL_TYPE_REGISTRY, IMAGE_MODEL_REGISTRY, VIDEO_MODEL_REGISTRY, CHAT_MODEL_REGISTRY, type ModelTypeMeta } from './modelTypes'
import { MODEL_TYPE_REGISTRY } from './modelTypes'

// 导入所有 Provider
import { dalleProvider } from './dalle'
import { geminiProvider } from './gemini'
import { openaiChatImageProvider } from './openaiChatImage'
import { mjProvider, type MJService, type MJButton } from './mj'
import { koukoutuProvider } from './koukoutu'
import { videoUnifiedProvider } from './videoUnified'
import { openaiVideoProvider } from './openaiVideo'

// 所有 Provider 列表
const providers: Provider[] = [
  dalleProvider,
  geminiProvider,
  openaiChatImageProvider,
  mjProvider,
  koukoutuProvider,
  videoUnifiedProvider,
  openaiVideoProvider,
]

/**
 * 根据 apiFormat 获取 Provider
 */
export function getProvider(apiFormat: ApiFormat): Provider | undefined {
  return providers.find(p => p.meta.apiFormat === apiFormat)
}

/**
 * 获取所有异步 apiFormat 列表（供 taskPoller 使用）
 */
export function getAsyncApiFormats(): ApiFormat[] {
  return providers.filter(p => p.meta.isAsync).map(p => p.meta.apiFormat)
}

/**
 * 生成 apiFormat -> label 映射
 */
export function getApiFormatLabels(): Record<string, string> {
  return Object.fromEntries(providers.map(p => [p.meta.apiFormat, p.meta.label]))
}

/**
 * 获取所有 Provider 元数据
 */
export function getAllProviderMetas(): ProviderMeta[] {
  return providers.map(p => p.meta)
}

/**
 * 根据模型类型获取可用的 API 格式
 */
export function getApiFormatsForModelType(modelType: ImageModelType | VideoModelType): ApiFormat[] {
  return providers
    .filter(p => p.meta.supportedModelTypes.includes(modelType))
    .map(p => p.meta.apiFormat)
}

/**
 * 获取指定 Provider 的能力
 */
export function getCapabilities(apiFormat: ApiFormat): ModelCapabilities {
  return getProvider(apiFormat)?.meta.capabilities ?? {}
}

/**
 * 获取指定 Provider 的验证规则
 */
export function getValidationRules(apiFormat: ApiFormat): ValidationRules {
  return getProvider(apiFormat)?.meta.validation ?? {}
}

/**
 * 获取所有 API 格式列表
 */
export function getAllApiFormats(): ApiFormat[] {
  return providers.map(p => p.meta.apiFormat)
}

/**
 * 根据模型类型获取元数据
 */
export function getModelTypeMeta(modelType: ImageModelType | VideoModelType) {
  return MODEL_TYPE_REGISTRY.find(m => m.type === modelType)
}

/**
 * 获取模型类型的显示名称
 */
export function getModelTypeLabel(modelType: ImageModelType | VideoModelType): string {
  return getModelTypeMeta(modelType)?.label ?? modelType
}

/**
 * 获取模型类型的默认配置
 */
export function getModelTypeDefaults(modelType: ImageModelType | VideoModelType) {
  return getModelTypeMeta(modelType)?.defaults
}

// 导出 MJ 特有类型
export type { MJService, MJButton }

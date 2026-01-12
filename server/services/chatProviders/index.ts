/**
 * Chat Provider 聚合入口
 *
 * 统一管理所有对话服务的 Provider。
 */

import type { ChatProvider, ChatApiFormat } from './types'
export * from './types'

// 导入所有 Provider
import { openaiChatProvider } from './openaiChat'
import { claudeProvider } from './claude'

// 所有 Provider 列表
const providers: ChatProvider[] = [
  openaiChatProvider,
  claudeProvider,
]

/**
 * 根据 apiFormat 获取 ChatProvider
 */
export function getChatProvider(apiFormat: ChatApiFormat): ChatProvider | undefined {
  return providers.find(p => p.apiFormat === apiFormat)
}

/**
 * 生成 apiFormat -> label 映射
 */
export function getChatApiFormatLabels(): Record<string, string> {
  return Object.fromEntries(providers.map(p => [p.apiFormat, p.label]))
}

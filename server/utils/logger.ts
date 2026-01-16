// 上游请求日志工具
// 设计原则：所有日志操作都在 try-catch 中，失败静默，绝不影响主流程

export type LogType = '聊天' | '重放' | '压缩' | '标题' | '开场白' | '优化'
export type LogEvent = '请求' | '完成' | '响应' | '中断' | '错误' | '重试' | '用量'

export interface LogContext {
  type: LogType
  conversationId?: number
  conversationTitle?: string
  assistantId?: number
  assistantName?: string
  configName?: string   // 上游配置名称（优先显示）
  baseUrl?: string      // API 地址（configName 未设置时备用）
  modelName?: string
  keyName?: string
}

// 安全执行日志操作，失败静默
function safeLog(fn: () => void): void {
  try {
    fn()
  } catch {
    // 静默失败，绝不影响主流程
  }
}

export interface RequestStats {
  systemPromptSize: number    // 提示词字节数
  historyCount: number        // 历史消息条数
  historySize: number         // 历史消息字节数
  currentSize: number         // 当前消息字节数
  enableThinking?: boolean    // 是否开启思考模式
  enableWebSearch?: boolean   // 是否开启联网搜索
  apiFormat?: string          // API 格式（openai-chat, claude, gemini 等）
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// 计算字符串字节数
export function calcSize(text: string): number {
  return new TextEncoder().encode(text).length
}

// 格式化字节数
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

// 格式化耗时
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 截断标题
function truncateTitle(title?: string): string {
  if (!title) return '无标题'
  if (title.length <= 15) return title
  return title.slice(0, 15) + '...'
}

// 日志前缀
function prefix(ctx: LogContext, event: LogEvent): string {
  if (ctx.conversationId) {
    return `[Chat] ${ctx.type}${event} | 对话#${ctx.conversationId} "${truncateTitle(ctx.conversationTitle)}"`
  }
  if (ctx.assistantId) {
    return `[Chat] ${ctx.type}${event} | 助手#${ctx.assistantId} "${ctx.assistantName || '未知'}"`
  }
  return `[Chat] ${ctx.type}${event}`
}

// 请求日志
export function logRequest(ctx: LogContext, stats: RequestStats): void {
  safeLog(() => {
    const total = stats.systemPromptSize + stats.historySize + stats.currentSize
    const keyInfo = ctx.keyName ? ` Key:${ctx.keyName}` : ''
    const upstream = ctx.configName || ctx.baseUrl || '未知'
    // 格式和思考模式信息
    const formatInfo = stats.apiFormat ? ` 格式:${stats.apiFormat}` : ''
    const thinkingInfo = stats.enableThinking !== undefined ? ` 思考:${stats.enableThinking ? '开' : '关'}` : ''
    const searchInfo = stats.enableWebSearch !== undefined ? ` 搜索:${stats.enableWebSearch ? '开' : '关'}` : ''
    const parts = [
      prefix(ctx, '请求'),
      `上游:${upstream} 模型:${ctx.modelName || '未知'}${keyInfo}${formatInfo}${thinkingInfo}${searchInfo}`,
      `提示词:${formatSize(stats.systemPromptSize)} 历史:${stats.historyCount}条/${formatSize(stats.historySize)} 当前:${formatSize(stats.currentSize)}`,
      `总计:${formatSize(total)}`,
    ]
    console.log(parts.join(' | '))
  })
}

// 压缩请求日志（特殊格式）
export function logCompressRequest(ctx: LogContext, compressCount: number, compressSize: number, promptSize: number): void {
  safeLog(() => {
    const total = compressSize + promptSize
    const keyInfo = ctx.keyName ? ` Key:${ctx.keyName}` : ''
    const upstream = ctx.configName || ctx.baseUrl || '未知'
    const parts = [
      prefix(ctx, '请求'),
      `上游:${upstream} 模型:${ctx.modelName || '未知'}${keyInfo}`,
      `待压缩:${compressCount}条/${formatSize(compressSize)} 提示词:${formatSize(promptSize)}`,
      `总计:${formatSize(total)}`,
    ]
    console.log(parts.join(' | '))
  })
}

// 流式完成日志
export function logComplete(ctx: LogContext, responseSize: number, durationMs: number): void {
  safeLog(() => {
    const parts = [
      prefix(ctx, '完成'),
      `响应:${formatSize(responseSize)}`,
      `耗时:${formatDuration(durationMs)}`,
    ]
    console.log(parts.join(' | '))
  })
}

// 非流式响应日志
export function logResponse(ctx: LogContext, responseSize: number, durationMs: number): void {
  safeLog(() => {
    const parts = [
      prefix(ctx, '响应'),
      `响应:${formatSize(responseSize)}`,
      `耗时:${formatDuration(durationMs)}`,
    ]
    console.log(parts.join(' | '))
  })
}

// 标题响应日志（特殊格式）
export function logTitleResponse(ctx: LogContext, title: string, durationMs: number): void {
  safeLog(() => {
    const parts = [
      prefix(ctx, '响应'),
      `标题:"${title}"`,
      `耗时:${formatDuration(durationMs)}`,
    ]
    console.log(parts.join(' | '))
  })
}

// 中断日志
export function logInterrupt(ctx: LogContext, receivedSize: number, durationMs: number, reason: string): void {
  safeLog(() => {
    const parts = [
      prefix(ctx, '中断'),
      `已接收:${formatSize(receivedSize)}`,
      `耗时:${formatDuration(durationMs)}`,
      `原因:${reason}`,
    ]
    console.warn(parts.join(' | '))
  })
}

// 错误日志
export function logError(ctx: LogContext, error: string): void {
  safeLog(() => {
    console.error(`${prefix(ctx, '错误')} | ${error}`)
  })
}

// 重试日志
export function logRetry(ctx: LogContext, attempt: number, reason: string): void {
  safeLog(() => {
    console.warn(`${prefix(ctx, '重试')} | 第${attempt}次 | 原因:${reason}`)
  })
}

// Token 用量日志
export function logUsage(ctx: LogContext, usage: TokenUsage): void {
  safeLog(() => {
    const parts = [
      prefix(ctx, '用量'),
      `输入:${usage.promptTokens}tokens 输出:${usage.completionTokens}tokens 总计:${usage.totalTokens}tokens`,
    ]
    console.log(parts.join(' | '))
  })
}

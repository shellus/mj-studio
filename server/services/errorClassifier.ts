// 错误分类器 - 根据 API 响应识别错误类型并生成标准消息
// 参考: docs/ERROR_SPEC.md

// 错误类型定义
export type ErrorCode =
  | 'CONTENT_FILTERED'   // 内容审核
  | 'QUOTA_EXCEEDED'     // 配额耗尽
  | 'RATE_LIMITED'       // 请求过频
  | 'AUTH_FAILED'        // 认证失败
  | 'MODEL_UNAVAILABLE'  // 模型不可用
  | 'INVALID_PARAMS'     // 参数错误
  | 'UPSTREAM_TIMEOUT'   // 上游超时
  | 'NETWORK_ERROR'      // 网络错误
  | 'EMPTY_RESPONSE'     // 空响应
  | 'PARSE_ERROR'        // 解析失败
  | 'SAVE_FAILED'        // 保存失败
  | 'UNKNOWN'            // 未知错误

// 错误类型对应的标准消息
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CONTENT_FILTERED: '内容被安全过滤器拒绝',
  QUOTA_EXCEEDED: 'API 配额已用尽',
  RATE_LIMITED: '请求过于频繁，请稍后重试',
  AUTH_FAILED: 'API 密钥无效或已过期',
  MODEL_UNAVAILABLE: '模型暂不可用',
  INVALID_PARAMS: '请求参数无效',
  UPSTREAM_TIMEOUT: '上游服务响应超时',
  NETWORK_ERROR: '网络连接失败',
  EMPTY_RESPONSE: '未收到有效响应',
  PARSE_ERROR: '响应格式异常',
  SAVE_FAILED: '图片保存失败',
  UNKNOWN: '生成失败',
}

// 错误分类输入
interface ErrorInput {
  status?: number
  statusText?: string
  message?: string
  code?: string
  type?: string
  data?: unknown
  errorName?: string  // error.name，如 'FetchError', 'AbortError'
}

// Fetch 错误类型（用于 classifyFetchError 的类型安全）
interface FetchErrorLike {
  status?: number
  statusCode?: number
  statusText?: string
  statusMessage?: string
  message?: string
  code?: string
  type?: string
  name?: string
  data?: {
    error?: {
      code?: string
      type?: string
    }
  } | unknown
}

// 检查字符串是否包含任意关键词（不区分大小写）
function containsAny(str: string | undefined, keywords: string[]): boolean {
  if (!str) return false
  const lower = str.toLowerCase()
  return keywords.some(kw => lower.includes(kw.toLowerCase()))
}

// 分类错误并返回标准消息
export function classifyError(input: ErrorInput): string {
  const { status, message, code, type, data, errorName } = input

  // 保存原始消息，用于无法分类时返回
  const originalMessage = message?.trim()

  // 合并所有文本用于关键词匹配
  const allText = [
    message,
    code,
    type,
    typeof data === 'string' ? data : JSON.stringify(data || ''),
  ].join(' ')

  // === 第一优先级：根据错误消息/错误码内容判断 ===

  // 1. 内容审核 (CONTENT_FILTERED)
  if (
    containsAny(allText, ['safety', 'blocked', 'filtered', 'content_policy', 'moderation', 'moderated', 'violat', 'nsfw', 'inappropriate', 'sensitive'])
  ) {
    return ERROR_MESSAGES.CONTENT_FILTERED
  }

  // 2. 空响应 (EMPTY_RESPONSE) - 优先于状态码检查
  if (
    containsAny(allText, ['empty response', 'empty_response', 'no response', '未收到', 'no meaningful content'])
  ) {
    return ERROR_MESSAGES.EMPTY_RESPONSE
  }

  // 3. 配额耗尽 (QUOTA_EXCEEDED)
  if (
    containsAny(allText, ['quota', 'balance', 'insufficient', 'billing', 'exceeded your'])
  ) {
    return ERROR_MESSAGES.QUOTA_EXCEEDED
  }

  // 4. 请求过频 (RATE_LIMITED) - 仅根据消息内容
  if (
    containsAny(allText, ['rate limit', 'rate_limit', 'too many requests'])
  ) {
    return ERROR_MESSAGES.RATE_LIMITED
  }

  // 5. 认证失败 (AUTH_FAILED)
  if (
    containsAny(allText, ['unauthorized', 'invalid key', 'invalid_api_key', 'authentication failed'])
  ) {
    return ERROR_MESSAGES.AUTH_FAILED
  }

  // 6. 模型不可用 (MODEL_UNAVAILABLE)
  if (
    containsAny(allText, ['model not found', 'does not exist', 'model_not_found'])
  ) {
    return ERROR_MESSAGES.MODEL_UNAVAILABLE
  }

  // 7. 上游超时 (UPSTREAM_TIMEOUT)
  if (
    containsAny(allText, ['timeout', 'timed out']) ||
    errorName === 'TimeoutError'
  ) {
    return ERROR_MESSAGES.UPSTREAM_TIMEOUT
  }

  // 8. 网络错误 (NETWORK_ERROR)
  if (
    errorName === 'FetchError' || errorName === 'NetworkError' ||
    containsAny(allText, ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'network error', 'connection error', 'connection refused'])
  ) {
    return ERROR_MESSAGES.NETWORK_ERROR
  }

  // === 第二优先级：根据 HTTP 状态码判断（兜底） ===

  if (status === 401 || status === 403) {
    return ERROR_MESSAGES.AUTH_FAILED
  }
  if (status === 402) {
    return ERROR_MESSAGES.QUOTA_EXCEEDED
  }
  if (status === 404) {
    return ERROR_MESSAGES.MODEL_UNAVAILABLE
  }
  if (status === 429) {
    return ERROR_MESSAGES.RATE_LIMITED
  }
  if (status === 400) {
    return ERROR_MESSAGES.INVALID_PARAMS
  }
  if (status === 504 || status === 408) {
    return ERROR_MESSAGES.UPSTREAM_TIMEOUT
  }

  // 10. 未知错误 - 如果有原始消息则返回，否则返回通用消息
  return originalMessage || ERROR_MESSAGES.UNKNOWN
}

// 从 ofetch 错误中提取信息并分类
export function classifyFetchError(error: unknown): string {
  // 处理非对象类型的错误
  if (error === null || error === undefined) {
    return ERROR_MESSAGES.UNKNOWN
  }
  if (typeof error === 'string') {
    return classifyError({ message: error })
  }
  if (typeof error !== 'object') {
    return ERROR_MESSAGES.UNKNOWN
  }

  const err = error as FetchErrorLike
  const data = err.data as FetchErrorLike['data']
  const errorData = data && typeof data === 'object' && 'error' in data ? (data as { error?: { code?: string; type?: string } }).error : undefined

  return classifyError({
    status: err.status || err.statusCode,
    statusText: err.statusText || err.statusMessage,
    message: err.message,
    code: errorData?.code || err.code,
    type: errorData?.type || err.type,
    data: data,
    errorName: err.name,
  })
}

// 导出错误消息常量供其他模块使用
export { ERROR_MESSAGES }

// 从 unknown 错误中提取 fetch 错误属性（用于日志记录）
export function extractFetchErrorInfo(error: unknown): {
  status: number | null
  statusText: string | undefined
  body: unknown
  message: string
  errorType: string
} {
  if (error === null || error === undefined) {
    return { status: null, statusText: undefined, body: undefined, message: 'Unknown error', errorType: 'Error' }
  }
  if (typeof error === 'string') {
    return { status: null, statusText: undefined, body: undefined, message: error, errorType: 'Error' }
  }
  if (typeof error !== 'object') {
    return { status: null, statusText: undefined, body: undefined, message: String(error), errorType: 'Error' }
  }

  const err = error as FetchErrorLike
  return {
    status: err.status || err.statusCode || null,
    statusText: err.statusText || err.statusMessage,
    body: err.data,
    message: err.message || 'Unknown error',
    errorType: err.name || 'Error',
  }
}

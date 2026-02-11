// HTTP 请求/响应日志工具
// 设计原则：所有日志操作都在 try-catch 中，失败静默，绝不影响主流程
// 完整记录请求和响应内容，仅截断 Base64 图片数据以控制日志体积

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOGS_DIR = 'logs'

// 日志数据类型
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type LogData = Record<string, JsonValue>

// 日志请求体类型（接受任意可序列化对象）
type LogRequestBody = unknown

// 安全执行日志操作，失败静默
function safeLog(fn: () => void): void {
  try {
    fn()
  } catch {
    // 静默失败，绝不影响主流程
  }
}

// 计算字符串字节数
function calcSize(text: string): number {
  return new TextEncoder().encode(text).length
}

// 截断 Base64 图片数据（保留，避免日志文件过大）
function truncateBase64(value: string): string {
  const size = calcSize(value)
  return `[base64 ${size} bytes]`
}

// 递归处理请求体（深拷贝，仅截断 Base64 图片数据）
function processBody(body: LogRequestBody): JsonValue {
  if (body === null || body === undefined) {
    return null
  }

  if (typeof body !== 'object') {
    if (typeof body === 'string' || typeof body === 'number' || typeof body === 'boolean') {
      return body
    }
    return String(body)
  }

  if (Array.isArray(body)) {
    return body.map(item => processBody(item))
  }

  const result: Record<string, JsonValue> = {}
  const obj = body as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // 仅截断 Base64 图片数据
      if (value.startsWith('data:image/')) {
        result[key] = truncateBase64(value)
      } else if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        result[key] = truncateBase64(value)
      } else {
        result[key] = value
      }
    } else if (typeof value === 'object' && value !== null) {
      result[key] = processBody(value)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    } else if (value === null) {
      result[key] = null
    } else if (value !== undefined) {
      result[key] = String(value)
    }
  }

  return result
}

// 处理 headers（保留原始值以便重放调试）
function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers || typeof headers !== 'object') {
    return {}
  }
  return { ...headers }
}

// 确保日志目录存在
function ensureLogDir(type: 'conversation' | 'task', id: number): string {
  const dir = join(LOGS_DIR, type)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${id}.jsonl`)
}

// 写入日志行
function appendLog(filePath: string, logData: LogData): void {
  safeLog(() => {
    appendFileSync(filePath, JSON.stringify(logData) + '\n')
  })
}

// ==================== 对话日志 ====================

export function logConversationRequest(
  conversationId: number,
  messageId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: LogRequestBody }
): void {
  const filePath = ensureLogDir('conversation', conversationId)
  const logData: LogData = {
    timestamp: new Date().toISOString(),
    event: 'request',
    messageId,
    url: data.url,
    method: data.method,
    headers: sanitizeHeaders(data.headers) as unknown as JsonValue,
    body: data.body ? processBody(data.body) : null,
  }
  appendLog(filePath, logData)
}

export function logConversationResponse(
  conversationId: number,
  messageId: number,
  data: {
    status: number | null
    statusText?: string
    content?: string
    body?: LogRequestBody
    error?: string
    errorType?: string
    durationMs: number
  }
): void {
  const filePath = ensureLogDir('conversation', conversationId)
  const logData: LogData = {
    timestamp: new Date().toISOString(),
    event: 'response',
    messageId,
    status: data.status,
    durationMs: data.durationMs,
  }

  // 成功（status 2xx）
  if (data.status && data.status >= 200 && data.status < 300) {
    if (data.content !== undefined) {
      logData.content = data.content
    }
  }
  // HTTP 错误（status 4xx/5xx）
  else if (data.status && data.status >= 400) {
    logData.statusText = data.statusText ?? null
    logData.body = data.body !== undefined ? processBody(data.body) : null
  }
  // 网络错误（status null）
  else {
    logData.error = data.error ?? null
    logData.errorType = data.errorType ?? null
  }

  appendLog(filePath, logData)
}

// ==================== 任务日志 ====================

export function logTaskRequest(
  taskId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: LogRequestBody }
): void {
  const filePath = ensureLogDir('task', taskId)
  const logData: LogData = {
    timestamp: new Date().toISOString(),
    event: 'request',
    url: data.url,
    method: data.method,
    headers: sanitizeHeaders(data.headers) as unknown as JsonValue,
    body: data.body ? processBody(data.body) : null,
  }
  appendLog(filePath, logData)
}

export function logTaskResponse(
  taskId: number,
  data: {
    status: number | null
    statusText?: string
    body?: LogRequestBody
    error?: string
    errorType?: string
    durationMs: number
  }
): void {
  const filePath = ensureLogDir('task', taskId)
  const logData: LogData = {
    timestamp: new Date().toISOString(),
    event: 'response',
    status: data.status,
    durationMs: data.durationMs,
  }

  // 成功或 HTTP 错误
  if (data.status !== null) {
    logData.statusText = data.statusText ?? null
    logData.body = data.body !== undefined ? processBody(data.body) : null
  }
  // 网络错误
  else {
    logData.error = data.error ?? null
    logData.errorType = data.errorType ?? null
  }

  appendLog(filePath, logData)
}

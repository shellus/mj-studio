// HTTP 请求/响应日志工具
// 设计原则：所有日志操作都在 try-catch 中，失败静默，绝不影响主流程

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOGS_DIR = 'logs'

// 日志数据类型
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type LogData = Record<string, JsonValue>

// 日志请求体类型（接受任意可序列化对象）
type LogRequestBody = unknown

// 消息类型
interface LogMessage {
  role?: string
  content?: string | JsonValue
  [key: string]: JsonValue | undefined
}

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

// 脱敏 Authorization header
function sanitizeAuthHeader(value: string): string {
  if (value.length <= 8) {
    return '****'
  }
  const start = value.slice(0, 4)
  const end = value.slice(-4)
  return `${start}****${end}`
}

// 生成内容预览（开头20字符 + ... + 结尾20字符 + 字节数）
function generateContentPreview(content: string): string {
  const length = calcSize(content)

  if (content.length <= 40) {
    return `${content} (${length}字节)`
  }

  const start = content.slice(0, 20)
  const end = content.slice(-20)
  return `${start}...${end} (${length}字节)`
}

// 裁剪消息内容
function truncateMessageContent(content: string | JsonValue): string {
  // 如果是字符串，裁剪
  if (typeof content === 'string') {
    return generateContentPreview(content)
  }
  // 如果是数组或对象，序列化后裁剪
  const str = JSON.stringify(content)
  return generateContentPreview(str)
}

// 裁剪消息数组
function truncateMessages(messages: LogMessage[]): LogData {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { _truncated: true, _summary: '[empty]', _first: [], _last: null }
  }

  const size = calcSize(JSON.stringify(messages))
  const summary = `[${messages.length} messages, ${size} bytes]`

  // 获取开头两条消息
  const firstMessages = messages.slice(0, 2).map(msg => ({
    role: msg.role ?? 'unknown',
    content: truncateMessageContent(msg.content ?? ''),
  }))

  // 获取最后一条消息
  const lastMsg = messages[messages.length - 1]
  const lastMessage = lastMsg ? {
    role: lastMsg.role ?? 'unknown',
    content: truncateMessageContent(lastMsg.content ?? ''),
  } : null

  return {
    _truncated: true,
    _summary: summary,
    _first: firstMessages as unknown as JsonValue,
    _last: lastMessage as unknown as JsonValue,
  }
}

// 截断 Base64 图片数据
function truncateBase64(value: string): string {
  const size = calcSize(value)
  return `[base64 ${size} bytes]`
}

// 递归处理请求体，脱敏敏感信息（深拷贝，不修改原始数据）
function sanitizeBody(body: LogRequestBody): JsonValue {
  if (body === null || body === undefined) {
    return null
  }

  if (typeof body !== 'object') {
    // 基础类型直接返回（作为 JsonValue）
    if (typeof body === 'string' || typeof body === 'number' || typeof body === 'boolean') {
      return body
    }
    return String(body)
  }

  if (Array.isArray(body)) {
    return body.map(item => sanitizeBody(item))
  }

  const result: Record<string, JsonValue> = {}
  const obj = body as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    // 处理 messages 数组
    if (key === 'messages' && Array.isArray(value)) {
      result[key] = truncateMessages(value as LogMessage[]) as unknown as JsonValue
      continue
    }

    // 处理 system 字段（Claude API）
    if (key === 'system' && typeof value === 'string') {
      result[key] = generateContentPreview(value)
      continue
    }

    // 处理字符串类型的值
    if (typeof value === 'string') {
      // Data URL 格式
      if (value.startsWith('data:image/')) {
        result[key] = truncateBase64(value)
      }
      // 纯 Base64 格式（长度 > 100）
      else if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        result[key] = truncateBase64(value)
      }
      else {
        result[key] = value
      }
    }
    // 递归处理对象和数组
    else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeBody(value)
    }
    // 基础类型
    else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    }
    else if (value === null) {
      result[key] = null
    }
    else if (value === undefined) {
      // 跳过 undefined
    }
    else {
      result[key] = String(value)
    }
  }

  return result
}

// 脱敏 headers
function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers || typeof headers !== 'object') {
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'authorization' || lowerKey === 'x-api-key') {
      result[key] = sanitizeAuthHeader(value)
    } else {
      result[key] = value
    }
  }
  return result
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
    body: data.body ? sanitizeBody(data.body) : null,
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
      logData.contentPreview = generateContentPreview(data.content)
      logData.contentLength = calcSize(data.content)
    }
  }
  // HTTP 错误（status 4xx/5xx）
  else if (data.status && data.status >= 400) {
    logData.statusText = data.statusText ?? null
    logData.body = data.body !== undefined ? sanitizeBody(data.body) : null
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
    body: data.body ? sanitizeBody(data.body) : null,
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
    logData.body = data.body !== undefined ? sanitizeBody(data.body) : null
  }
  // 网络错误
  else {
    logData.error = data.error ?? null
    logData.errorType = data.errorType ?? null
  }

  appendLog(filePath, logData)
}

// HTTP 请求/响应日志工具
// 设计原则：所有日志操作都在 try-catch 中，失败静默，绝不影响主流程

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const LOGS_DIR = 'logs'

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
function truncateMessageContent(content: string | any): string {
  // 如果是字符串，裁剪
  if (typeof content === 'string') {
    return generateContentPreview(content)
  }
  // 如果是数组或对象，序列化后裁剪
  const str = JSON.stringify(content)
  return generateContentPreview(str)
}

// 裁剪消息数组
function truncateMessages(messages: any[]): any {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages
  }

  const size = calcSize(JSON.stringify(messages))
  const summary = `[${messages.length} messages, ${size} bytes]`

  // 获取开头两条消息
  const firstMessages = messages.slice(0, 2).map(msg => ({
    role: msg.role,
    content: truncateMessageContent(msg.content),
  }))

  // 获取最后一条消息
  const lastMessage = {
    role: messages[messages.length - 1].role,
    content: truncateMessageContent(messages[messages.length - 1].content),
  }

  return {
    _truncated: true,
    _summary: summary,
    _first: firstMessages,
    _last: lastMessage,
  }
}

// 截断 Base64 图片数据
function truncateBase64(value: string): string {
  const size = calcSize(value)
  return `[base64 ${size} bytes]`
}

// 递归处理请求体，脱敏敏感信息
function sanitizeBody(body: any): any {
  if (typeof body !== 'object' || body === null) {
    return body
  }

  const result: any = Array.isArray(body) ? [] : {}

  for (const [key, value] of Object.entries(body)) {
    // 处理 messages 数组
    if (key === 'messages' && Array.isArray(value)) {
      result[key] = truncateMessages(value)
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
    else if (typeof value === 'object') {
      result[key] = sanitizeBody(value)
    }
    else {
      result[key] = value
    }
  }

  return result
}

// 脱敏 headers
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
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
function appendLog(filePath: string, logData: any): void {
  safeLog(() => {
    appendFileSync(filePath, JSON.stringify(logData) + '\n')
  })
}

// ==================== 对话日志 ====================

export function logConversationRequest(
  conversationId: number,
  messageId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: any }
): void {
  const filePath = ensureLogDir('conversation', conversationId)
  const logData = {
    timestamp: new Date().toISOString(),
    event: 'request',
    messageId,
    url: data.url,
    method: data.method,
    headers: sanitizeHeaders(data.headers),
    body: data.body ? sanitizeBody(data.body) : undefined,
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
    body?: any
    error?: string
    errorType?: string
    durationMs: number
  }
): void {
  const filePath = ensureLogDir('conversation', conversationId)
  const logData: any = {
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
    logData.statusText = data.statusText
    logData.body = data.body
  }
  // 网络错误（status null）
  else {
    logData.error = data.error
    logData.errorType = data.errorType
  }

  appendLog(filePath, logData)
}

// ==================== 任务日志 ====================

export function logTaskRequest(
  taskId: number,
  data: { url: string; method: string; headers: Record<string, string>; body?: any }
): void {
  const filePath = ensureLogDir('task', taskId)
  const logData = {
    timestamp: new Date().toISOString(),
    event: 'request',
    url: data.url,
    method: data.method,
    headers: sanitizeHeaders(data.headers),
    body: data.body ? sanitizeBody(data.body) : undefined,
  }
  appendLog(filePath, logData)
}

export function logTaskResponse(
  taskId: number,
  data: {
    status: number | null
    statusText?: string
    body?: any
    error?: string
    errorType?: string
    durationMs: number
  }
): void {
  const filePath = ensureLogDir('task', taskId)
  const logData: any = {
    timestamp: new Date().toISOString(),
    event: 'response',
    status: data.status,
    durationMs: data.durationMs,
  }

  // 成功或 HTTP 错误
  if (data.status !== null) {
    logData.statusText = data.statusText
    logData.body = data.body
  }
  // 网络错误
  else {
    logData.error = data.error
    logData.errorType = data.errorType
  }

  appendLog(filePath, logData)
}

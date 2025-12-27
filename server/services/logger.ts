// 任务日志服务 - 记录完整请求和响应数据
import { appendFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const LOGS_DIR = 'logs'

function getLogDir(taskId: number): string {
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const dir = join(LOGS_DIR, date, String(taskId))
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 根据任务创建日期查找日志目录
function findLogDir(taskId: number, createdAt: Date): string | null {
  // 尝试任务创建日期
  const taskDate = createdAt.toISOString().split('T')[0]
  const primaryDir = join(LOGS_DIR, taskDate, String(taskId))
  if (existsSync(primaryDir)) {
    return primaryDir
  }

  // 如果找不到，遍历所有日期目录查找（兜底）
  if (!existsSync(LOGS_DIR)) return null

  const dateDirs = readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse() // 最新的在前

  for (const dateDir of dateDirs) {
    const taskDir = join(LOGS_DIR, dateDir, String(taskId))
    if (existsSync(taskDir)) {
      return taskDir
    }
  }

  return null
}

export function logRequest(taskId: number, data: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: any
}) {
  try {
    const dir = getLogDir(taskId)
    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      ...data,
      // 隐藏敏感信息
      headers: data.headers ? {
        ...data.headers,
        Authorization: data.headers.Authorization ? '[REDACTED]' : undefined,
      } : undefined,
    }
    // 追加模式写入，每条记录一行 JSON
    appendFileSync(join(dir, 'requests.jsonl'), JSON.stringify(logData) + '\n')
  } catch (e) {
    console.error('[Logger] 写入请求日志失败:', e)
  }
}

export function logResponse(taskId: number, data: {
  status?: number
  statusText?: string
  data?: any
  error?: any
}) {
  try {
    const dir = getLogDir(taskId)
    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      ...data,
    }
    // 追加模式写入，每条记录一行 JSON
    appendFileSync(join(dir, 'responses.jsonl'), JSON.stringify(logData) + '\n')
  } catch (e) {
    console.error('[Logger] 写入响应日志失败:', e)
  }
}

// 读取任务日志
export function readTaskLogs(taskId: number, createdAt: Date): {
  requests: any[]
  responses: any[]
} | null {
  const dir = findLogDir(taskId, createdAt)
  if (!dir) return null

  let requests: any[] = []
  let responses: any[] = []

  // 新格式：JSONL 文件
  const requestsPath = join(dir, 'requests.jsonl')
  const responsesPath = join(dir, 'responses.jsonl')

  // 旧格式：单个 JSON 文件（兼容）
  const legacyRequestPath = join(dir, 'request.json')
  const legacyResponsePath = join(dir, 'response.json')

  // 优先读取新格式
  if (existsSync(requestsPath)) {
    try {
      const lines = readFileSync(requestsPath, 'utf-8').trim().split('\n')
      requests = lines.filter(l => l).map(l => JSON.parse(l))
    } catch (e) {
      console.error('[Logger] 读取请求日志失败:', e)
    }
  } else if (existsSync(legacyRequestPath)) {
    // 兼容旧格式
    try {
      requests = [JSON.parse(readFileSync(legacyRequestPath, 'utf-8'))]
    } catch (e) {
      console.error('[Logger] 读取请求日志失败:', e)
    }
  }

  if (existsSync(responsesPath)) {
    try {
      const lines = readFileSync(responsesPath, 'utf-8').trim().split('\n')
      responses = lines.filter(l => l).map(l => JSON.parse(l))
    } catch (e) {
      console.error('[Logger] 读取响应日志失败:', e)
    }
  } else if (existsSync(legacyResponsePath)) {
    // 兼容旧格式
    try {
      responses = [JSON.parse(readFileSync(legacyResponsePath, 'utf-8'))]
    } catch (e) {
      console.error('[Logger] 读取响应日志失败:', e)
    }
  }

  // 至少要有 response 才返回
  if (responses.length === 0) return null

  return { requests, responses }
}

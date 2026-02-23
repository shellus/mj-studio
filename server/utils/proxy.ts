import { ProxyAgent, fetch as undiciFetch } from 'undici'

class FetchResponseError extends Error {
  status: number
  statusText: string
  data: unknown

  constructor(status: number, statusText: string, data: unknown) {
    // 优先使用响应体中的详细错误信息
    const bodyMsg = data && typeof data === 'object' && 'error' in data
      ? (data as { error?: { message?: string } }).error?.message
      : undefined
    super(bodyMsg || `HTTP ${status}: ${statusText}`)
    this.name = 'FetchResponseError'
    this.status = status
    this.statusText = statusText
    this.data = data
  }
}

async function assertOk(res: Response): Promise<Response> {
  if (!res.ok) {
    let data: unknown
    try {
      data = await res.json()
    } catch {
      const text = await res.text().catch(() => undefined)
      if (text) { try { data = JSON.parse(text) } catch { data = text } }
    }
    throw new FetchResponseError(res.status, res.statusText, data)
  }
  return res
}

/**
 * 带代理的 fetch 函数
 * 有代理时使用 undici fetch + ProxyAgent，否则使用全局 fetch
 * 对非 2xx 响应自动抛出 FetchResponseError（兼容 extractFetchErrorInfo）
 */
export function proxyFetch(proxyUrl: string | undefined): typeof globalThis.fetch {
  if (!proxyUrl) {
    return (async (input: any, init?: any) => {
      const res = await globalThis.fetch(input, init)
      return assertOk(res)
    }) as any
  }
  const agent = new ProxyAgent(proxyUrl)
  return (async (input: any, init?: any) => {
    const res = await undiciFetch(input, { ...init, dispatcher: agent }) as any
    return assertOk(res)
  }) as any
}

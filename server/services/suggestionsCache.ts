// 开场白建议缓存服务
// 按助手 ID 缓存，1 小时过期

interface CacheEntry {
  suggestions: string[]
  expireAt: number
}

// 内存缓存
const cache = new Map<number, CacheEntry>()

// 缓存过期时间：1 小时
const CACHE_TTL = 60 * 60 * 1000

export function useSuggestionsCache() {
  // 获取缓存
  function get(assistantId: number): string[] | null {
    const entry = cache.get(assistantId)
    if (!entry) return null

    // 检查是否过期
    if (Date.now() > entry.expireAt) {
      cache.delete(assistantId)
      return null
    }

    return entry.suggestions
  }

  // 设置缓存
  function set(assistantId: number, suggestions: string[]): void {
    cache.set(assistantId, {
      suggestions,
      expireAt: Date.now() + CACHE_TTL,
    })
  }

  // 清除指定助手的缓存
  function clear(assistantId: number): void {
    cache.delete(assistantId)
  }

  // 清除所有缓存
  function clearAll(): void {
    cache.clear()
  }

  return {
    get,
    set,
    clear,
    clearAll,
  }
}

import { db } from '../database'
import { proxies, upstreams, type Proxy, type NewProxy } from '../database/schema'
import { eq, and } from 'drizzle-orm'

export function useProxyService() {
  async function listByUser(userId: number): Promise<Proxy[]> {
    return db.query.proxies.findMany({
      where: eq(proxies.userId, userId),
      orderBy: proxies.id,
    })
  }

  async function create(data: { userId: number; name: string; url: string }): Promise<Proxy> {
    const [proxy] = await db.insert(proxies).values(data).returning()
    if (!proxy) throw new Error('创建代理失败')
    return proxy
  }

  async function update(id: number, userId: number, data: { name?: string; url?: string }): Promise<Proxy | undefined> {
    const [updated] = await db.update(proxies)
      .set(data)
      .where(and(eq(proxies.id, id), eq(proxies.userId, userId)))
      .returning()
    return updated
  }

  async function remove(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(proxies)
      .where(and(eq(proxies.id, id), eq(proxies.userId, userId)))
      .returning()
    if (result.length > 0) {
      // 级联清理：将引用该代理的上游的 proxyId 置为 null
      await db.update(upstreams).set({ proxyId: null }).where(eq(upstreams.proxyId, id))
    }
    return result.length > 0
  }

  async function getById(id: number): Promise<Proxy | undefined> {
    return db.query.proxies.findFirst({ where: eq(proxies.id, id) })
  }

  return { listByUser, create, update, remove, getById }
}

/** 获取上游关联的代理 URL（独立于 useProxyService 实例，避免循环调用） */
export async function getUpstreamProxyUrl(upstream: { proxyId?: number | null }): Promise<string | undefined> {
  if (!upstream.proxyId) return undefined
  const proxy = await useProxyService().getById(upstream.proxyId)
  return proxy?.url
}

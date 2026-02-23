// 代理配置管理
export interface Proxy {
  id: number
  userId: number
  name: string
  url: string
  createdAt: string
}

export function useProxies() {
  const proxies = useState<Proxy[]>('proxies', () => [])
  const isLoading = useState('proxies-loading', () => false)

  async function loadProxies() {
    isLoading.value = true
    try {
      proxies.value = await $fetch<Proxy[]>('/api/proxies')
    } catch (error) {
      console.error('加载代理配置失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function createProxy(data: { name: string; url: string }) {
    const proxy = await $fetch<Proxy>('/api/proxies', { method: 'POST', body: data })
    proxies.value.push(proxy)
    return proxy
  }

  async function updateProxy(id: number, data: { name?: string; url?: string }) {
    const updated = await $fetch<Proxy>(`/api/proxies/${id}`, { method: 'PUT', body: data })
    const index = proxies.value.findIndex(p => p.id === id)
    if (index >= 0) proxies.value[index] = updated
    return updated
  }

  async function deleteProxy(id: number) {
    await $fetch(`/api/proxies/${id}`, { method: 'DELETE' })
    proxies.value = proxies.value.filter(p => p.id !== id)
  }

  return { proxies, isLoading, loadProxies, createProxy, updateProxy, deleteProxy }
}

import type { Upstream } from '../database/schema'
import { useUpstreamService } from './upstream'
import { getUpstreamProxyUrl } from './proxy'
import { proxyFetch } from '../utils/proxy'

export async function resolveUpstreamConnection(upstream: Upstream, keyName?: string) {
  const apiKey = useUpstreamService().getApiKey(upstream, keyName)
  const proxyUrl = await getUpstreamProxyUrl(upstream)
  const fetchFn = proxyFetch(proxyUrl)
  return { apiKey, fetchFn, baseUrl: upstream.baseUrl }
}

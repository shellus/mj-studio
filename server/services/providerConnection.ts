import type { Aimodel } from '../database/schema'
import { useUpstreamService } from './upstream'
import { getUpstreamProxyUrl } from './proxy'
import { proxyFetch } from '../utils/proxy'

export async function resolveUpstreamConnection(aimodel: Aimodel) {
  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    throw new Error('上游配置不存在')
  }
  const apiKey = upstreamService.getApiKey(upstream, aimodel.keyName)
  const proxyUrl = await getUpstreamProxyUrl(upstream)
  const fetchFn = proxyFetch(proxyUrl)
  return { apiKey, fetchFn, baseUrl: upstream.baseUrl, upstreamName: upstream.name }
}

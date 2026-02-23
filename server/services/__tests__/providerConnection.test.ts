import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveUpstreamConnection } from '../providerConnection'
import * as upstreamService from '../upstream'
import * as proxyService from '../proxy'

vi.mock('../upstream', () => ({
  useUpstreamService: vi.fn(),
}))

vi.mock('../proxy', () => ({
  getUpstreamProxyUrl: vi.fn(),
}))

vi.mock('../../utils/proxy', () => ({
  proxyFetch: vi.fn((url: string | undefined) => (url ? `proxy-fetch-${url}` : globalThis.fetch)),
}))

describe('resolveUpstreamConnection', () => {
  const mockUpstream = {
    id: 1, userId: 1, name: 'Test',
    baseUrl: 'https://api.example.com',
    apiKeys: [{ name: 'default', key: 'sk-test' }],
    proxyId: null,
    upstreamPlatform: null, userApiKey: null, upstreamInfo: null,
    remark: null, sortOrder: 0, disabled: false,
    createdAt: new Date(), deletedAt: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(upstreamService.useUpstreamService).mockReturnValue({
      getApiKey: vi.fn().mockReturnValue('sk-test'),
    } as any)
    vi.mocked(proxyService.getUpstreamProxyUrl).mockResolvedValue(undefined)
  })

  it('should return apiKey, fetchFn, and baseUrl', async () => {
    const result = await resolveUpstreamConnection(mockUpstream)
    expect(result.apiKey).toBe('sk-test')
    expect(result.baseUrl).toBe('https://api.example.com')
    expect(result.fetchFn).toBeDefined()
  })

  it('should pass keyName to getApiKey', async () => {
    const getApiKey = vi.fn().mockReturnValue('sk-custom')
    vi.mocked(upstreamService.useUpstreamService).mockReturnValue({ getApiKey } as any)

    const result = await resolveUpstreamConnection(mockUpstream, 'custom')
    expect(getApiKey).toHaveBeenCalledWith(mockUpstream, 'custom')
    expect(result.apiKey).toBe('sk-custom')
  })

  it('should resolve proxy URL', async () => {
    vi.mocked(proxyService.getUpstreamProxyUrl).mockResolvedValue('http://proxy:8080')
    const result = await resolveUpstreamConnection(mockUpstream)
    expect(proxyService.getUpstreamProxyUrl).toHaveBeenCalledWith(mockUpstream)
    expect(result.fetchFn).toBeDefined()
  })
})

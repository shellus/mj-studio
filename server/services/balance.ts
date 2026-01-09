// 余额查询服务
import type { UpstreamPlatform, UpstreamInfo } from '../database/schema'
import { getErrorMessage } from '../../app/shared/types'

export interface BalanceResult {
  success: boolean
  error?: string
  /** 上游信息（查询成功时返回） */
  upstreamInfo?: UpstreamInfo
}

/**
 * 解析 userApiKey 格式
 * 支持格式：userId:apiKey 或 纯 apiKey
 */
function parseUserApiKey(userApiKey: string): { userId?: string; apiKey: string } {
  const colonIndex = userApiKey.indexOf(':')
  if (colonIndex > 0) {
    return {
      userId: userApiKey.slice(0, colonIndex),
      apiKey: userApiKey.slice(colonIndex + 1),
    }
  }
  return { apiKey: userApiKey }
}

/**
 * 查询 API Key 余额
 * @param baseUrl API 基础地址
 * @param userApiKey 用户 API Key，格式：userId:apiKey 或纯 apiKey
 * @param platform 上游平台类型
 */
export async function queryBalance(
  baseUrl: string,
  userApiKey: string,
  platform: UpstreamPlatform
): Promise<BalanceResult> {
  try {
    const { userId, apiKey } = parseUserApiKey(userApiKey)

    switch (platform) {
      case 'oneapi':
        return await queryOneApiBalance(baseUrl, apiKey, userId, 'New-Api-User')
      case 'n1n':
        return await queryOneApiBalance(baseUrl, apiKey, userId, 'Rix-Api-User')
      case 'yunwu':
        return { success: false, error: '云雾暂不支持 API 余额查询' }
      default:
        return { success: false, error: '不支持的余额查询类型' }
    }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  }
}

/**
 * OneAPI/NewAPI 格式余额查询
 * 端点: GET /api/user/self
 * @param baseUrl API 基础地址
 * @param apiKey API Key
 * @param userId 用户 ID（可选）
 * @param userIdHeader 用户 ID Header 名称
 */
async function queryOneApiBalance(
  baseUrl: string,
  apiKey: string,
  userId?: string,
  userIdHeader?: string
): Promise<BalanceResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/user/self`

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 如果提供了 userId，添加对应的 Header
  if (userId && userIdHeader) {
    headers[userIdHeader] = userId
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  // OneAPI 返回格式: { success: true, data: { id, username, display_name, email, quota, used_quota, group, ... } }
  if (data.success && data.data) {
    const d = data.data
    const quota = d.quota || 0
    const usedQuota = d.used_quota || 0

    const upstreamInfo: UpstreamInfo = {
      userId: d.id,
      username: d.username,
      displayName: d.display_name,
      email: d.email,
      quota,
      usedQuota,
      group: d.group,
      queriedAt: new Date().toISOString(),
    }

    return {
      success: true,
      upstreamInfo,
    }
  }

  return { success: false, error: data.message || '查询失败' }
}

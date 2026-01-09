/**
 * URL 工具函数
 */

/**
 * 获取完整的资源 URL
 * 使用 PUBLIC_URL 环境变量拼接完整地址
 *
 * @param resourceUrl 资源路径（如 /api/images/xxx）
 * @returns 完整的 URL（如 https://example.com/api/images/xxx），未配置时返回原始路径
 */
export function getFullResourceUrl(resourceUrl: string | null): string | null {
  if (!resourceUrl) return null

  // 如果已经是完整 URL，直接返回
  if (resourceUrl.startsWith('http://') || resourceUrl.startsWith('https://')) {
    return resourceUrl
  }

  // 获取基础 URL
  const config = useRuntimeConfig()
  let baseUrl = config.publicUrl as string

  if (!baseUrl) {
    // 未配置，返回原始路径
    return resourceUrl
  }

  // 确保 baseUrl 没有尾部斜杠
  baseUrl = baseUrl.replace(/\/$/, '')

  // 确保 resourceUrl 以斜杠开头
  const path = resourceUrl.startsWith('/') ? resourceUrl : `/${resourceUrl}`

  return `${baseUrl}${path}`
}

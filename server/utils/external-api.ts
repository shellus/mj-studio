/**
 * HTTP API 层工具函数
 *
 * 将 MCP Tool Result 格式解包为 HTTP API 响应数据
 */

/**
 * 解包 MCP Tool Result 格式为 HTTP API 数据
 */
export function unwrapMcpResult(mcpResult: {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}): { data: any; isError: boolean } {
  const text = mcpResult.content[0]?.text
  if (!text) {
    return { data: { error: '空响应' }, isError: true }
  }
  const data = JSON.parse(text)
  const isError = mcpResult.isError || false
  return { data, isError }
}

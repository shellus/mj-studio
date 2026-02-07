/**
 * get_upload_url 工具实现
 * 返回文件上传所需的 URL、认证信息和 curl 示例
 */
import type { AuthUser } from '../../../../app/shared/types'
import { signJwt } from '../../../utils/jwt'
import { getFullResourceUrl } from '../../../utils/url'

export async function getUploadUrl(user: AuthUser) {
  // 签发短期 JWT（10 分钟有效期），用于上传认证
  const token = await signJwt(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      purpose: 'mcp-upload',
    },
    '10m',
  )

  const uploadPath = '/api/mcp/upload'
  const uploadUrl = getFullResourceUrl(uploadPath) || uploadPath

  const result = {
    uploadUrl,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    fieldName: 'file',
    curlExample: `curl -X POST '${uploadUrl}' -H 'Authorization: Bearer ${token}' -F 'file=@/path/to/your/file'`,
    expiresIn: '10 minutes',
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

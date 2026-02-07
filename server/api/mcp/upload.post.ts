// MCP 文件上传端点
// 使用临时 JWT 认证（由 get_upload_url 工具签发）
import { saveFile, getFileUrl } from '../../services/file'
import { verifyJwt } from '../../utils/jwt'
import { getFullResourceUrl } from '../../utils/url'

export default defineEventHandler(async (event) => {
  // 从 header 获取 token
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      message: '缺少认证信息',
    })
  }

  const token = authHeader.slice(7)
  const payload = await verifyJwt(token)

  if (!payload) {
    throw createError({
      statusCode: 401,
      message: 'Token 无效或已过期',
    })
  }

  // 验证 purpose
  if (payload.purpose !== 'mcp-upload') {
    throw createError({
      statusCode: 403,
      message: '无效的上传凭证',
    })
  }

  // 读取 multipart/form-data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: '缺少文件数据',
    })
  }

  // 找到文件字段
  const fileField = formData.find(f => f.name === 'file')
  if (!fileField || !fileField.data) {
    throw createError({
      statusCode: 400,
      message: '缺少文件数据',
    })
  }

  const result = saveFile(
    fileField.data,
    fileField.filename || 'unknown',
    fileField.type || 'application/octet-stream',
  )

  if (!result) {
    throw createError({
      statusCode: 500,
      message: '保存文件失败',
    })
  }

  const localUrl = getFileUrl(result.fileName)

  return {
    success: true,
    url: getFullResourceUrl(localUrl) || localUrl,
  }
})

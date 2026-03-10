/**
 * POST /api/external/upload - 上传文件
 *
 * 使用 API Key 认证，直接一步上传，无需两步获取临时 token
 */
import { requireApiKeyAuth } from '../../utils/jwt'
import { saveFile, getFileUrl } from '../../services/file'
import { getFullResourceUrl } from '../../utils/url'

export default defineEventHandler(async (event) => {
  try {
    await requireApiKeyAuth(event)

    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '缺少文件数据' }
    }

    const fileField = formData.find(f => f.name === 'file')
    if (!fileField || !fileField.data) {
      setResponseStatus(event, 400)
      return { status: 'error', error: '缺少文件数据' }
    }

    const result = saveFile(
      fileField.data,
      fileField.filename || 'unknown',
      fileField.type || 'application/octet-stream',
    )

    if (!result) {
      setResponseStatus(event, 500)
      return { status: 'error', error: '保存文件失败' }
    }

    const localUrl = getFileUrl(result.fileName)
    const url = getFullResourceUrl(localUrl) || localUrl

    return { status: 'ok', data: { url } }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const err = error as { statusCode: number; message: string }
      setResponseStatus(event, err.statusCode)
      return { status: 'error', error: err.message }
    }
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    setResponseStatus(event, 500)
    return { status: 'error', error: errorMsg }
  }
})

// 上传文件
import { saveFile, getFileUrl } from '../../services/file'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

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

  const result = saveFile(fileField.data, fileField.filename || 'unknown', fileField.type || 'application/octet-stream')
  if (!result) {
    throw createError({
      statusCode: 500,
      message: '保存文件失败',
    })
  }

  return {
    success: true,
    fileName: result.fileName,
    url: getFileUrl(result.fileName),
    mimeType: result.mimeType,
    size: result.size,
  }
})

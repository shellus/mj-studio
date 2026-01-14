// POST /api/files/from-base64 - 将 Base64 保存到本地并返回 URL
import { saveBase64File, getFileUrl } from '../../services/file'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { base64 } = body

  if (!base64 || typeof base64 !== 'string') {
    throw createError({ statusCode: 400, message: '缺少 base64 参数' })
  }

  const result = saveBase64File(base64)
  if (!result) {
    throw createError({ statusCode: 500, message: '保存文件失败' })
  }

  return {
    url: getFileUrl(result.fileName),
    fileName: result.fileName,
  }
})

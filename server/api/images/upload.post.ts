// 上传图片（向后兼容，建议使用 /api/files/upload）
import { saveBase64File, getFileUrl } from '../../services/file'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { base64 } = body

  if (!base64) {
    throw createError({
      statusCode: 400,
      message: '缺少图片数据',
    })
  }

  const result = saveBase64File(base64)
  if (!result) {
    throw createError({
      statusCode: 500,
      message: '保存图片失败',
    })
  }

  return {
    success: true,
    fileName: result.fileName,
    url: getFileUrl(result.fileName),
  }
})

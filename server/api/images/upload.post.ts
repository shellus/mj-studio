// 上传图片
import { saveBase64Image, getImageUrl } from '../../services/image'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  const body = await readBody(event)
  const { base64 } = body

  if (!base64) {
    throw createError({
      statusCode: 400,
      message: '缺少图片数据',
    })
  }

  const fileName = saveBase64Image(base64)
  if (!fileName) {
    throw createError({
      statusCode: 500,
      message: '保存图片失败',
    })
  }

  return {
    success: true,
    fileName,
    url: getImageUrl(fileName),
  }
})

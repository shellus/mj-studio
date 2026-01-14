// POST /api/files/to-base64 - 将本地文件 URL 转为 Base64
import { readFileAsBase64 } from '../../services/file'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { url } = body

  if (!url || typeof url !== 'string') {
    throw createError({ statusCode: 400, message: '缺少 url 参数' })
  }

  // 从 URL 提取文件名：/api/files/xxx.png -> xxx.png
  const match = url.match(/\/api\/files\/(.+)$/)
  if (!match) {
    throw createError({ statusCode: 400, message: '无效的文件 URL' })
  }

  const fileName = match[1]
  if (!fileName) {
    throw createError({ statusCode: 400, message: '无效的文件 URL' })
  }
  const base64 = readFileAsBase64(fileName)

  if (!base64) {
    throw createError({ statusCode: 404, message: '文件不存在' })
  }

  return { base64 }
})

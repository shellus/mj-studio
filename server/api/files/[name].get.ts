// 获取文件
import { readFile } from '../../services/file'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')

  if (!name) {
    throw createError({
      statusCode: 400,
      message: '缺少文件名称',
    })
  }

  const result = readFile(name)
  if (!result) {
    throw createError({
      statusCode: 404,
      message: '文件不存在',
    })
  }

  // 设置缓存头
  setHeader(event, 'Content-Type', result.mimeType)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return result.buffer
})

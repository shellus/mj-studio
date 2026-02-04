// 文件存储服务 - 管理文件的下载、存储和访问
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, createReadStream, type ReadStream } from 'fs'
import { join } from 'path'

// 文件存储目录
const UPLOAD_DIR = join(process.cwd(), 'uploads')

// 确保上传目录存在
function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

// 生成唯一文件名
function generateFileName(data: Buffer | string, ext: string): string {
  const hash = createHash('md5')
    .update(typeof data === 'string' ? data : data)
    .digest('hex')
    .slice(0, 16)
  const timestamp = Date.now().toString(36)
  return `${timestamp}-${hash}.${ext}`
}

// 从扩展名获取 MIME 类型
export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const mimeTypes: Record<string, string> = {
    // 图片
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    // 文档
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    md: 'text/markdown',
    // 音频
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    // 视频
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    // 代码
    js: 'text/javascript',
    ts: 'text/typescript',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    xml: 'application/xml',
    // 压缩包
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

// 从 MIME 类型获取扩展名
function getExtFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'text/plain': 'txt',
    'application/json': 'json',
  }
  return extMap[mimeType] || 'bin'
}

// 从 URL 下载文件并保存到本地
export async function downloadFile(url: string, logPrefix?: string): Promise<string | null> {
  try {
    ensureUploadDir()

    const response = await fetch(url)
    if (!response.ok) {
      console.error(`${logPrefix || '[File]'} 下载失败:`, response.status, url)
      return null
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const mimeTypePart = contentType.split(';')[0]
    let ext = getExtFromMimeType(mimeTypePart || 'application/octet-stream')

    // 如果无法从 Content-Type 识别扩展名，尝试从 URL 路径提取
    if (ext === 'bin') {
      try {
        const urlPath = new URL(url).pathname
        const urlExt = urlPath.split('.').pop()?.toLowerCase()
        if (urlExt && /^[a-z0-9]{2,5}$/.test(urlExt)) {
          ext = urlExt
        }
      } catch {
        // URL 解析失败，保持 bin
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const fileName = generateFileName(buffer, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, buffer)
    console.log(`${logPrefix || '[File]'} 已下载: ${fileName}`)

    return fileName
  } catch (error) {
    console.error('[File] 下载文件失败:', error)
    return null
  }
}

// 保存结果接口
export interface SaveFileResult {
  fileName: string
  mimeType: string
  size: number
}

// 从 Buffer 保存文件（用于 FormData 上传）
export function saveFile(data: Buffer, originalName: string, mimeType: string): SaveFileResult | null {
  try {
    ensureUploadDir()

    // 从原始文件名获取扩展名
    let ext = 'bin'
    const nameParts = originalName.split('.')
    if (nameParts.length > 1) {
      ext = nameParts.pop()!.toLowerCase()
    } else {
      ext = getExtFromMimeType(mimeType)
    }

    const fileName = generateFileName(data, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, data)
    console.log('[File] 已保存:', fileName)

    return {
      fileName,
      mimeType,
      size: data.length,
    }
  } catch (error) {
    console.error('[File] 保存文件失败:', error)
    return null
  }
}

// 从 base64 保存文件（支持任意类型）
export function saveBase64File(base64Data: string, originalName?: string): SaveFileResult | null {
  try {
    ensureUploadDir()

    // 解析 data URL: data:[<mediatype>][;base64],<data>
    const matches = base64Data.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
    if (!matches) {
      console.error('[File] 无效的 base64 格式')
      return null
    }

    const mimeType = matches[1]
    const data = matches[2]
    if (!mimeType || !data) {
      console.error('[File] 无效的 base64 格式')
      return null
    }
    const buffer = Buffer.from(data, 'base64')

    // 从原始文件名或 MIME 类型获取扩展名
    let ext = 'bin'
    if (originalName) {
      const nameParts = originalName.split('.')
      if (nameParts.length > 1) {
        ext = nameParts.pop()!.toLowerCase()
      }
    } else {
      ext = getExtFromMimeType(mimeType)
    }

    const fileName = generateFileName(buffer, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, buffer)
    console.log('[File] 已保存:', fileName)

    return {
      fileName,
      mimeType,
      size: buffer.length,
    }
  } catch (error) {
    console.error('[File] 保存文件失败:', error)
    return null
  }
}

// 读取文件
export function readFile(fileName: string): { buffer: Buffer; mimeType: string; size: number } | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const buffer = readFileSync(filePath)
    const mimeType = getMimeType(fileName)
    const stats = statSync(filePath)

    return { buffer, mimeType, size: stats.size }
  } catch (error) {
    console.error('[File] 读取文件失败:', error)
    return null
  }
}

// 获取文件信息（不读取内容）
export function getFileInfo(fileName: string): { mimeType: string; size: number; path: string } | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const mimeType = getMimeType(fileName)
    const stats = statSync(filePath)

    return { mimeType, size: stats.size, path: filePath }
  } catch (error) {
    console.error('[File] 获取文件信息失败:', error)
    return null
  }
}

// 创建文件流（用于 Range 请求）
export function createFileStream(fileName: string, start?: number, end?: number): ReadStream | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const options: { start?: number; end?: number } = {}
    if (start !== undefined) options.start = start
    if (end !== undefined) options.end = end

    return createReadStream(filePath, options)
  } catch (error) {
    console.error('[File] 创建文件流失败:', error)
    return null
  }
}

// 读取文件为 base64
export function readFileAsBase64(fileName: string): string | null {
  const result = readFile(fileName)
  if (!result) return null

  return `data:${result.mimeType};base64,${result.buffer.toString('base64')}`
}

// 检查文件是否存在
export function fileExists(fileName: string): boolean {
  return existsSync(join(UPLOAD_DIR, fileName))
}

// 获取文件的本地 URL 路径
export function getFileUrl(fileName: string): string {
  return `/api/files/${fileName}`
}

// 判断是否为图片类型
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// ==================== 向后兼容的别名 ====================

/** @deprecated 使用 downloadFile */
export const downloadImage = downloadFile

/** @deprecated 使用 saveBase64File */
export function saveBase64Image(base64Data: string): string | null {
  const result = saveBase64File(base64Data)
  return result?.fileName || null
}

/** @deprecated 使用 readFile */
export const readImage = readFile

/** @deprecated 使用 readFileAsBase64 */
export const readImageAsBase64 = readFileAsBase64

/** @deprecated 使用 fileExists */
export const imageExists = fileExists

/** @deprecated 使用 getFileUrl */
export function getImageUrl(fileName: string): string {
  return `/api/files/${fileName}`
}

/**
 * 迁移脚本：将助手头像从 base64 转换为文件 URL
 *
 * 运行方式：npx tsx scripts/migrate-avatar-to-url.ts
 */

import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// 配置
const DB_PATH = join(process.cwd(), 'data', 'mj-studio.db')
const UPLOAD_DIR = join(process.cwd(), 'uploads')

// 确保上传目录存在
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

// 从 MIME 类型获取扩展名
function getExtFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  return extMap[mimeType] || 'png'
}

// 生成唯一文件名
function generateFileName(data: Buffer, ext: string): string {
  const hash = createHash('md5').update(data).digest('hex').slice(0, 16)
  const timestamp = Date.now().toString(36)
  return `${timestamp}-${hash}.${ext}`
}

// 保存 base64 为文件
function saveBase64ToFile(base64Data: string): string | null {
  const matches = base64Data.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    return null
  }

  const mimeType = matches[1]
  const data = matches[2]
  const buffer = Buffer.from(data, 'base64')
  const ext = getExtFromMimeType(mimeType)
  const fileName = generateFileName(buffer, ext)
  const filePath = join(UPLOAD_DIR, fileName)

  writeFileSync(filePath, buffer)
  return `/api/files/${fileName}`
}

// 主函数
async function main() {
  console.log('开始迁移助手头像...')
  console.log(`数据库路径: ${DB_PATH}`)
  console.log(`上传目录: ${UPLOAD_DIR}`)

  if (!existsSync(DB_PATH)) {
    console.error('数据库文件不存在!')
    process.exit(1)
  }

  const db = new Database(DB_PATH)

  // 查询所有 base64 头像的助手
  const assistants = db.prepare(`
    SELECT id, name, avatar
    FROM assistants
    WHERE avatar IS NOT NULL AND avatar LIKE 'data:image%'
  `).all() as { id: number; name: string; avatar: string }[]

  console.log(`找到 ${assistants.length} 个需要迁移的助手头像`)

  let successCount = 0
  let failCount = 0

  for (const assistant of assistants) {
    console.log(`\n处理助手 [${assistant.id}] ${assistant.name}...`)

    const url = saveBase64ToFile(assistant.avatar)
    if (url) {
      db.prepare('UPDATE assistants SET avatar = ? WHERE id = ?').run(url, assistant.id)
      console.log(`  ✓ 已转换为: ${url}`)
      successCount++
    } else {
      console.log(`  ✗ 转换失败`)
      failCount++
    }
  }

  db.close()

  console.log('\n迁移完成!')
  console.log(`成功: ${successCount}, 失败: ${failCount}`)
}

main().catch(console.error)

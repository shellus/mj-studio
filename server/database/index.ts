import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = './data/mj-studio.db'

// 确保数据目录存在
const dir = dirname(dbPath)
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

const sqlite = new Database(dbPath)
export const db = drizzle(sqlite, { schema })

// 启动时自动执行迁移
// 生产环境迁移文件在 /app/server/database/migrations
// 开发环境迁移文件在 ./server/database/migrations
const migrationsFolder = existsSync('/app/server/database/migrations')
  ? '/app/server/database/migrations'
  : './server/database/migrations'

try {
  migrate(db, { migrationsFolder })
  console.log('[DB] 数据库迁移完成')
} catch (error: any) {
  // 忽略 "table already exists" 错误（首次从旧迁移系统切换时）
  if (error?.cause?.code === 'SQLITE_ERROR' && error?.cause?.message?.includes('already exists')) {
    console.log('[DB] 数据库表已存在，跳过初始迁移')
  } else {
    console.error('[DB] 数据库迁移失败:', error)
    throw error
  }
}

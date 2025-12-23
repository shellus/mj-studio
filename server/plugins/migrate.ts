// 启动时自动执行数据库迁移
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from '../database'
import { existsSync } from 'fs'

export default defineNitroPlugin(() => {
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
})

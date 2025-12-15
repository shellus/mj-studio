import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
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

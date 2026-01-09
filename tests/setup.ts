// 测试环境设置
// 手动加载 .env 文件，因为 vitest 不自动加载

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env')

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) continue

    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim()
      // 只设置未定义的环境变量
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}

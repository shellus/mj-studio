// 密码哈希工具（使用 Node.js crypto 模块）
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

// 哈希密码
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derivedKey.toString('hex')}`
}

// 验证密码
export async function verifyPassword(storedPassword: string, suppliedPassword: string): Promise<boolean> {
  const [salt, key] = storedPassword.split(':')
  if (!salt || !key) return false

  const derivedKey = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer
  const keyBuffer = Buffer.from(key, 'hex')

  return timingSafeEqual(derivedKey, keyBuffer)
}

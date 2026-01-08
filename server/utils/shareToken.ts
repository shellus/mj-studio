// 分享链接 token 工具函数
// 使用简单的 AES 加密生成短 token
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export interface SharePayload {
  conversationId: number
}

// 获取密钥（取前32字节作为AES-256密钥）
function getShareKey(): Buffer {
  const secret = process.env.NUXT_JWT_SECRET || process.env.NUXT_SESSION_PASSWORD
  if (!secret || secret.length < 32) {
    throw new Error('NUXT_JWT_SECRET 环境变量未设置或长度不足32位')
  }
  return Buffer.from(secret.slice(0, 32))
}

// 生成分享 token
export async function createShareToken(conversationId: number): Promise<string> {
  const key = getShareKey()
  const iv = randomBytes(12) // GCM 推荐 12 字节 IV

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.from(String(conversationId))

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()

  // 组合: iv(12) + authTag(16) + encrypted
  const combined = Buffer.concat([iv, authTag, encrypted])

  // 使用 hex 编码
  return combined.toString('hex')
}

// 验证分享 token
export async function verifyShareToken(token: string): Promise<SharePayload | null> {
  try {
    const key = getShareKey()
    const combined = Buffer.from(token, 'hex')

    const iv = combined.subarray(0, 12)
    const authTag = combined.subarray(12, 28)
    const encrypted = combined.subarray(28)

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const conversationId = parseInt(decrypted.toString(), 10)

    if (isNaN(conversationId)) return null

    return { conversationId }
  } catch {
    return null
  }
}

// JWT 工具函数
import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'

export interface JwtPayload {
  userId: number
  email: string
  name: string | null
}

// 获取 JWT 密钥（从环境变量读取）
function getJwtSecret(): Uint8Array {
  const secret = process.env.NUXT_JWT_SECRET || process.env.NUXT_SESSION_PASSWORD
  if (!secret || secret.length < 32) {
    throw new Error('NUXT_JWT_SECRET 环境变量未设置或长度不足32位')
  }
  return new TextEncoder().encode(secret)
}

// 生成 JWT token
export async function signJwt(payload: JwtPayload): Promise<string> {
  const secret = getJwtSecret()

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30天过期
    .sign(secret)

  return token
}

// 验证 JWT token
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)

    return {
      userId: payload.userId as number,
      email: payload.email as string,
      name: payload.name as string | null,
    }
  } catch {
    return null
  }
}

// 从请求头获取 token
export function getTokenFromHeader(event: H3Event): string | null {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

// 从请求中获取用户信息
export async function getUserFromEvent(event: H3Event): Promise<JwtPayload | null> {
  const token = getTokenFromHeader(event)
  if (!token) {
    return null
  }
  return verifyJwt(token)
}

// 用户信息（兼容原 nuxt-auth-utils 格式）
export interface AuthUser {
  id: number
  email: string
  name: string | null
}

// 要求认证（验证失败抛出 401 错误）
// 返回 { user } 格式，兼容原 requireUserSession
export async function requireAuth(event: H3Event): Promise<{ user: AuthUser }> {
  const payload = await getUserFromEvent(event)
  if (!payload) {
    throw createError({
      statusCode: 401,
      message: '未登录或登录已过期',
    })
  }
  return {
    user: {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
    },
  }
}

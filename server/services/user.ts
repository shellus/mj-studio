// 用户服务层
import { db } from '../database'
import { users, type User } from '../database/schema'
import { eq } from 'drizzle-orm'

export function useUserService() {
  // 通过邮箱查找用户
  async function findByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.email, email),
    })
  }

  // 通过ID查找用户
  async function findById(id: number): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    })
  }

  // 创建用户
  async function createUser(data: {
    email: string
    password: string // 已哈希的密码
    name?: string
  }): Promise<User> {
    const [user] = await db.insert(users).values({
      email: data.email,
      password: data.password,
      name: data.name ?? null,
    }).returning()
    if (!user) {
      throw new Error('创建用户失败')
    }
    return user
  }

  return {
    findByEmail,
    findById,
    createUser,
  }
}

// POST /api/auth/register - 用户注册
import { useUserService } from '../../services/user'
import { signJwt } from '../../utils/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, name } = body

  // 验证输入
  if (!email || !password) {
    throw createError({
      statusCode: 400,
      message: '请输入邮箱和密码',
    })
  }

  if (password.length < 6) {
    throw createError({
      statusCode: 400,
      message: '密码至少6位',
    })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw createError({
      statusCode: 400,
      message: '邮箱格式不正确',
    })
  }

  const userService = useUserService()

  // 检查邮箱是否已注册
  const existingUser = await userService.findByEmail(email)
  if (existingUser) {
    throw createError({
      statusCode: 400,
      message: '该邮箱已注册',
    })
  }

  // 哈希密码
  const hashedPassword = await hashPassword(password)

  // 创建用户
  const user = await userService.createUser({
    email,
    password: hashedPassword,
    name,
  })

  // 生成 JWT token
  const token = await signJwt({
    userId: user.id,
    email: user.email,
    name: user.name,
  })

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  }
})

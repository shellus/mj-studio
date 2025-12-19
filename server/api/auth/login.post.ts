// POST /api/auth/login - 用户登录
import { useUserService } from '../../services/user'
import { signJwt } from '../../utils/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  // 验证输入
  if (!email || !password) {
    throw createError({
      statusCode: 400,
      message: '请输入邮箱和密码',
    })
  }

  const userService = useUserService()

  // 查找用户
  const user = await userService.findByEmail(email)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: '邮箱或密码错误',
    })
  }

  // 验证密码
  const isValid = await verifyPassword(user.password, password)
  if (!isValid) {
    throw createError({
      statusCode: 401,
      message: '邮箱或密码错误',
    })
  }

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

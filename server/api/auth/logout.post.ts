// POST /api/auth/logout - 用户登出
export default defineEventHandler(async (event) => {
  await clearUserSession(event)

  return {
    success: true,
    message: '已登出',
  }
})

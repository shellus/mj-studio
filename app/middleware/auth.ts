// 认证中间件 - 未登录跳转到登录页
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, isInitialized, init } = useAuth()

  // 客户端确保已初始化
  if (import.meta.client && !isInitialized.value) {
    init()
  }

  // 服务端跳过检查（JWT 存在 localStorage，SSR 时无法访问）
  if (import.meta.server) {
    return
  }

  if (!loggedIn.value) {
    return navigateTo('/login')
  }
})

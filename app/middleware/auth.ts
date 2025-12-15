// 认证中间件 - 未登录跳转到登录页
export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch } = useUserSession()

  // 确保会话状态已加载
  if (import.meta.server) {
    await fetch()
  }

  if (!loggedIn.value) {
    return navigateTo('/login')
  }
})

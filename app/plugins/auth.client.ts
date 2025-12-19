// 客户端认证初始化插件
export default defineNuxtPlugin(() => {
  const { init, getAuthHeader, logout } = useAuth()
  init()

  // 为全局 $fetch 添加拦截器，自动带上 Authorization header
  globalThis.$fetch = $fetch.create({
    onRequest({ options }) {
      const authHeader = getAuthHeader()
      if (authHeader.Authorization) {
        options.headers = {
          ...options.headers,
          ...authHeader,
        }
      }
    },
    onResponseError({ response }) {
      // 401 时自动登出并跳转登录页
      if (response.status === 401) {
        logout()
        navigateTo('/login')
      }
    },
  })
})

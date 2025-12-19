// JWT 认证 composable
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export interface AuthUser {
  id: number
  email: string
  name: string | null
}

// 全局状态
const token = ref<string | null>(null)
const user = ref<AuthUser | null>(null)
const isInitialized = ref(false)

export function useAuth() {
  const loggedIn = computed(() => !!token.value && !!user.value)

  // 初始化（从 localStorage 恢复状态）
  function init() {
    if (isInitialized.value || import.meta.server) return

    const savedToken = localStorage.getItem(TOKEN_KEY)
    const savedUser = localStorage.getItem(USER_KEY)

    if (savedToken && savedUser) {
      token.value = savedToken
      try {
        user.value = JSON.parse(savedUser)
      } catch {
        // JSON 解析失败，清除无效数据
        logout()
      }
    }

    isInitialized.value = true
  }

  // 登录
  function login(newToken: string, newUser: AuthUser) {
    token.value = newToken
    user.value = newUser

    if (!import.meta.server) {
      localStorage.setItem(TOKEN_KEY, newToken)
      localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    }
  }

  // 登出
  function logout() {
    token.value = null
    user.value = null

    if (!import.meta.server) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  // 更新用户信息
  function updateUser(newUser: Partial<AuthUser>) {
    if (user.value) {
      user.value = { ...user.value, ...newUser }
      if (!import.meta.server) {
        localStorage.setItem(USER_KEY, JSON.stringify(user.value))
      }
    }
  }

  // 获取 Authorization header（供插件使用）
  function getAuthHeader(): Record<string, string> {
    if (!token.value) return {}
    return { Authorization: `Bearer ${token.value}` }
  }

  return {
    token: readonly(token),
    user: readonly(user),
    loggedIn,
    isInitialized: readonly(isInitialized),
    init,
    login,
    logout,
    updateUser,
    getAuthHeader,
  }
}

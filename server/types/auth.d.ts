// 声明会话类型
declare module '#auth-utils' {
  interface User {
    id: number
    email: string
    name: string | null
  }

  interface UserSession {
    loggedInAt: number
  }
}

export {}

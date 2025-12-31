// 全局事件订阅插件
// 登录后自动建立 SSE 连接，登出时断开

export default defineNuxtPlugin(() => {
  const { loggedIn } = useAuth()
  const { connect, disconnect } = useGlobalEvents()

  // 监听登录状态变化
  watch(loggedIn, (newValue, oldValue) => {
    if (newValue && !oldValue) {
      // 登录成功，建立连接
      connect()
    } else if (!newValue && oldValue) {
      // 登出，断开连接
      disconnect()
    }
  }, { immediate: true })
})

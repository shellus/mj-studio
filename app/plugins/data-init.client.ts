// 全局数据初始化插件
// 在用户登录后自动加载 upstreams 和 assistants 数据
export default defineNuxtPlugin(async () => {
  const { loggedIn } = useAuth()

  // 只在登录状态下初始化
  if (!loggedIn.value) return

  const { upstreams, loadUpstreams } = useUpstreams()
  const { assistants, loadAssistants } = useAssistants()

  // 只在数据为空时加载（避免页面刷新时重复请求）
  const promises: Promise<void>[] = []

  if (upstreams.value.length === 0) {
    promises.push(loadUpstreams())
  }

  if (assistants.value.length === 0) {
    promises.push(loadAssistants())
  }

  // 并行加载
  if (promises.length > 0) {
    await Promise.all(promises)
  }
})

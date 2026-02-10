import { cleanupExpiredConversations } from '../tasks/cleanupExpiredConversations'

export default defineNitroPlugin(() => {
  // 每 10 分钟执行一次清理任务
  const interval = setInterval(async () => {
    try {
      const count = await cleanupExpiredConversations()
      if (count > 0) {
        console.log(`[清理任务] 删除了 ${count} 个过期临时对话`)
      }
    } catch (err) {
      console.error('[清理任务] 执行失败:', err)
    }
  }, 10 * 60 * 1000) // 10 分钟

  // Nitro 关闭时清理定时器
  // @ts-ignore
  if (import.meta.dev) {
    process.on('beforeExit', () => clearInterval(interval))
  }
})

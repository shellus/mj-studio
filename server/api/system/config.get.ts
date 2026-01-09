// GET /api/system/config - 获取系统配置状态（用于前端显示警告）
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()

  return {
    publicUrlConfigured: !!config.publicUrl,
  }
})

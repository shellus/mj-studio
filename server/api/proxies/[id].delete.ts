import { useProxyService } from '../../services/proxy'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))
  const deleted = await useProxyService().remove(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, message: '代理不存在' })
  return { success: true }
})

import { useProxyService } from '../../services/proxy'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = Number(getRouterParam(event, 'id'))
  const { name, url } = await readBody(event)
  const updated = await useProxyService().update(id, user.id, {
    ...(name !== undefined && { name: name.trim() }),
    ...(url !== undefined && { url: url.trim() }),
  })
  if (!updated) throw createError({ statusCode: 404, message: '代理不存在' })
  return updated
})

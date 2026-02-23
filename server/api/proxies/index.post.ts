import { useProxyService } from '../../services/proxy'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { name, url } = await readBody(event)
  if (!name?.trim()) throw createError({ statusCode: 400, message: '请输入代理名称' })
  if (!url?.trim()) throw createError({ statusCode: 400, message: '请输入代理地址' })
  return useProxyService().create({ userId: user.id, name: name.trim(), url: url.trim() })
})

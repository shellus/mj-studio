import { useProxyService } from '../../services/proxy'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return useProxyService().listByUser(user.id)
})

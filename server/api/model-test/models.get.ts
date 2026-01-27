import { useModelTestService } from '../../services/modelTest'
import type { ModelCategory } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  const category = (query.category as ModelCategory) || 'chat'

  const service = useModelTestService()
  const models = await service.getModelsForTest(user.id, category)

  return {
    models: models.map(m => ({
      aimodelId: m.aimodelId,
      upstreamId: m.upstreamId,
      upstreamName: m.upstreamName,
      modelName: m.modelName,
      name: m.name,
      modelType: m.modelType,
    })),
  }
})

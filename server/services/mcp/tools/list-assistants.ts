/**
 * list_assistants 工具实现
 */
import type { AuthUser } from '../../../../app/shared/types'
import { db } from '../../../database'
import { assistants, aimodels } from '../../../database/schema'
import { eq } from 'drizzle-orm'

export async function listAssistants(user: AuthUser) {
  const userAssistants = await db
    .select({
      id: assistants.id,
      name: assistants.name,
      description: assistants.description,
      conversationCount: assistants.conversationCount,
      aimodelId: assistants.aimodelId,
    })
    .from(assistants)
    .where(eq(assistants.userId, user.id))

  // 获取每个助手的模型名称
  const result = await Promise.all(
    userAssistants.map(async (a) => {
      let model: string | null = null
      if (a.aimodelId) {
        const aimodel = await db.query.aimodels.findFirst({
          where: eq(aimodels.id, a.aimodelId),
        })
        if (aimodel) {
          model = aimodel.name
        }
      }

      return {
        id: a.id,
        name: a.name,
        description: a.description,
        model,
        conversationCount: a.conversationCount,
      }
    }),
  )

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ assistants: result }) }],
  }
}

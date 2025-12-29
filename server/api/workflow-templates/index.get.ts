import { desc } from 'drizzle-orm'
import { db } from '../../database'
import { workflowTemplates } from '../../database/schema'

// GET /api/workflow-templates - 获取工作流模板列表
export default defineEventHandler(async () => {
  const list = await db
    .select({
      id: workflowTemplates.id,
      name: workflowTemplates.name,
      description: workflowTemplates.description,
      category: workflowTemplates.category,
      thumbnail: workflowTemplates.thumbnail,
      isBuiltin: workflowTemplates.isBuiltin,
      usageCount: workflowTemplates.usageCount,
    })
    .from(workflowTemplates)
    .orderBy(desc(workflowTemplates.usageCount))

  return {
    success: true,
    data: list,
  }
})

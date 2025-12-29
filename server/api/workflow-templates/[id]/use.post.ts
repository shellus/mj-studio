import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../database'
import { workflows, workflowTemplates } from '../../../database/schema'
import type { WorkflowData } from '../../../../app/shared/workflow-types'

// POST /api/workflow-templates/:id/use - 使用模板创建工作流
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string }>(event)

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的模板ID' })
  }

  // 查询模板
  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
    .limit(1)

  if (!template) {
    throw createError({ statusCode: 404, message: '模板不存在' })
  }

  // 读取模板 JSON
  const templatePath = join(process.cwd(), 'data/workflow-templates', template.filename)
  let templateData: WorkflowData

  try {
    const content = await readFile(templatePath, 'utf-8')
    templateData = JSON.parse(content)
  } catch (error) {
    throw createError({ statusCode: 500, message: '模板文件读取失败' })
  }

  // 创建新工作流
  const workflowName = body?.name || `${template.name} - 副本`
  const filename = `wf-${Date.now()}.json`
  const filePath = join(process.cwd(), 'data/workflows', filename)

  const workflowData: WorkflowData = {
    ...templateData,
    name: workflowName,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }

  // 保存 JSON 文件
  await writeFile(filePath, JSON.stringify(workflowData, null, 2), 'utf-8')

  // 创建数据库记录
  const [result] = await db.insert(workflows).values({
    userId,
    name: workflowName,
    description: template.description,
    filename,
  }).returning()

  // 更新模板使用次数
  await db
    .update(workflowTemplates)
    .set({ usageCount: sql`${workflowTemplates.usageCount} + 1` })
    .where(eq(workflowTemplates.id, id))

  return {
    success: true,
    data: {
      id: result.id,
      name: result.name,
    },
  }
})

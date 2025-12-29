import { writeFile } from 'fs/promises'
import { join } from 'path'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../../database'
import { workflows } from '../../database/schema'
import type { WorkflowData } from '../../../app/shared/workflow-types'

// PUT /api/workflows/:id - 更新工作流
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{
    name?: string
    description?: string
    data?: WorkflowData
  }>(event)

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的工作流ID' })
  }

  // 查询数据库
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(
      eq(workflows.id, id),
      eq(workflows.userId, userId),
      isNull(workflows.deletedAt),
    ))
    .limit(1)

  if (!workflow) {
    throw createError({ statusCode: 404, message: '工作流不存在' })
  }

  const filePath = join(process.cwd(), 'data/workflows', workflow.filename)

  // 如果有数据更新，更新 JSON 文件
  if (body.data) {
    const workflowData: WorkflowData = {
      ...body.data,
      version: body.data.version || '1.0.0',
      name: body.name || workflow.name,
      description: body.description ?? workflow.description ?? undefined,
      metadata: {
        createdAt: body.data.metadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }
    await writeFile(filePath, JSON.stringify(workflowData, null, 2), 'utf-8')
  }

  // 更新数据库记录
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  }
  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description

  await db
    .update(workflows)
    .set(updateData)
    .where(eq(workflows.id, id))

  return {
    success: true,
    message: '工作流已更新',
  }
})

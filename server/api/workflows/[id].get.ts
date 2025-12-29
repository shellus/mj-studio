import { readFile } from 'fs/promises'
import { join } from 'path'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../../database'
import { workflows } from '../../database/schema'
import type { WorkflowData } from '../../../app/shared/workflow-types'

// GET /api/workflows/:id - 获取工作流详情
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id
  const id = Number(getRouterParam(event, 'id'))

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

  // 读取 JSON 文件
  const filePath = join(process.cwd(), 'data/workflows', workflow.filename)
  let data: WorkflowData

  try {
    const content = await readFile(filePath, 'utf-8')
    data = JSON.parse(content)
  } catch (error) {
    throw createError({ statusCode: 500, message: '工作流文件读取失败' })
  }

  return {
    success: true,
    data: {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      thumbnail: workflow.thumbnail,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      workflow: data,
    },
  }
})

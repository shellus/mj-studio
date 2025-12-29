import { writeFile } from 'fs/promises'
import { join } from 'path'
import { db } from '../../database'
import { workflows } from '../../database/schema'
import type { WorkflowData } from '../../../app/shared/workflow-types'

// POST /api/workflows - 创建工作流
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const userId = user.id
  const body = await readBody<{
    name: string
    description?: string
    data: WorkflowData
  }>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, message: '工作流名称不能为空' })
  }

  if (!body.data) {
    throw createError({ statusCode: 400, message: '工作流数据不能为空' })
  }

  // 生成文件名
  const filename = `wf-${Date.now()}.json`
  const filePath = join(process.cwd(), 'data/workflows', filename)

  // 补充元数据
  const workflowData: WorkflowData = {
    ...body.data,
    version: '1.0.0',
    name: body.name,
    description: body.description,
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
    name: body.name,
    description: body.description,
    filename,
  }).returning()

  return {
    success: true,
    data: {
      id: result.id,
      name: result.name,
      filename: result.filename,
    },
  }
})

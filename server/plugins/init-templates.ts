import { eq } from 'drizzle-orm'
import { db } from '../database'
import { workflowTemplates } from '../database/schema'

// 内置模板定义
const builtinTemplates = [
  {
    name: '文生图',
    description: '输入提示词生成图片',
    category: 'image' as const,
    filename: 'text-to-image.json',
  },
  {
    name: '图生图',
    description: '上传参考图生成新图片',
    category: 'image' as const,
    filename: 'image-to-image.json',
  },
  {
    name: '图片混合',
    description: '混合多张图片生成新图片',
    category: 'image' as const,
    filename: 'image-blend.json',
  },
]

export default defineNitroPlugin(async () => {
  // 检查是否已有内置模板
  const existingTemplates = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.isBuiltin, true))

  if (existingTemplates.length === 0) {
    console.log('[Templates] 初始化内置工作流模板...')

    for (const template of builtinTemplates) {
      await db.insert(workflowTemplates).values({
        name: template.name,
        description: template.description,
        category: template.category,
        filename: template.filename,
        isBuiltin: true,
      })
    }

    console.log('[Templates] 内置模板初始化完成')
  }
})

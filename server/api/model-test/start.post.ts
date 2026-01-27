/**
 * POST /api/model-test/start - 开始模型可用性测试
 *
 * 创建测试记录
 */
import { useModelTestService } from '../../services/modelTest'
import type { ModelCategory } from '../../database/schema'

interface StartTestBody {
  category: ModelCategory
  prompt: string
  keywords?: string[]
}

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody<StartTestBody>(event)

  // 验证参数
  if (!body.category || !['chat', 'image', 'video'].includes(body.category)) {
    throw createError({
      statusCode: 400,
      message: '无效的模型分类',
    })
  }

  if (!body.prompt || body.prompt.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: '提示词不能为空',
    })
  }

  const service = useModelTestService()

  // 创建测试记录
  const record = await service.createRecord(
    user.id,
    body.category,
    body.prompt.trim(),
    body.keywords
  )

  return {
    recordId: record.id,
  }
})

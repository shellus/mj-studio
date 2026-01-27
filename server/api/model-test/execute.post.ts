/**
 * POST /api/model-test/execute - 执行单个模型测试
 *
 * 测试指定模型并保存结果
 */
import { useModelTestService } from '../../services/modelTest'
import { useUpstreamService } from '../../services/upstream'
import { useAimodelService } from '../../services/aimodel'
import { testChatModel } from '../../services/modelTestExecutors/chat'
import { testMediaModel } from '../../services/modelTestExecutors/media'

interface ExecuteTestBody {
  recordId: number
  aimodelId: number
  prompt: string
  keywords?: string[]
  timeout?: number
}

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody<ExecuteTestBody>(event)

  // 验证参数
  if (!body.recordId || !body.aimodelId || !body.prompt) {
    throw createError({
      statusCode: 400,
      message: '缺少必要参数',
    })
  }

  const modelTestService = useModelTestService()
  const upstreamService = useUpstreamService()
  const aimodelService = useAimodelService()

  // 获取模型信息
  const aimodel = await aimodelService.getById(body.aimodelId)
  if (!aimodel) {
    throw createError({
      statusCode: 404,
      message: '模型不存在',
    })
  }

  // 获取上游信息
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    throw createError({
      statusCode: 404,
      message: '上游配置不存在',
    })
  }

  // 验证上游属于当前用户
  if (upstream.userId !== user.id) {
    throw createError({
      statusCode: 403,
      message: '无权访问该模型',
    })
  }

  // 设置默认超时时间
  const timeout = body.timeout || getDefaultTimeout(aimodel.category)

  // 执行测试
  let result
  if (aimodel.category === 'chat') {
    result = await testChatModel(upstream, aimodel, body.prompt, timeout, body.keywords)
  } else {
    result = await testMediaModel(upstream, aimodel, body.prompt, timeout)
  }

  // 保存结果
  await modelTestService.saveResult(body.recordId, {
    aimodelId: aimodel.id,
    status: result.status,
    responseTime: result.responseTime,
    responsePreview: result.responsePreview,
    errorMessage: result.errorMessage,
  })

  return {
    aimodelId: aimodel.id,
    status: result.status,
    responseTime: result.responseTime,
    responsePreview: result.responsePreview,
    errorMessage: result.errorMessage,
  }
})

function getDefaultTimeout(category: string): number {
  switch (category) {
    case 'chat':
      return 30
    case 'image':
      return 120
    case 'video':
      return 300
    default:
      return 60
  }
}

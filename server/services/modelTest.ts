/**
 * 模型可用性测试服务层
 */
import { db } from '../database'
import { modelTestRecords, modelTestResults, aimodels, upstreams, type ModelTestRecord, type ModelTestResult, type ModelCategory } from '../database/schema'
import { eq, and, desc, isNull, asc, sql } from 'drizzle-orm'

/** 测试结果输入 */
export interface TestResultInput {
  aimodelId: number
  status: 'success' | 'failed'
  responseTime?: number
  responsePreview?: string
  errorMessage?: string
}

/** 带结果的测试记录 */
export interface RecordWithResults extends ModelTestRecord {
  results: ModelTestResult[]
}

/** 待测试的模型信息 */
export interface TestModelInfo {
  aimodelId: number
  upstreamId: number
  upstreamName: string
  modelName: string
  name: string
  modelType: string
  apiFormat: string
  keyName: string
  baseUrl: string
  apiKeys: any[]
}

export function useModelTestService() {
  /**
   * 创建测试记录
   */
  async function createRecord(
    userId: number,
    category: ModelCategory,
    prompt: string,
    keywords?: string[]
  ): Promise<ModelTestRecord> {
    const now = new Date().toISOString()
    const [record] = await db.insert(modelTestRecords).values({
      userId,
      category,
      prompt,
      keywords: keywords ? JSON.stringify(keywords) : null,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      createdAt: now,
    }).returning()

    if (!record) {
      throw new Error('创建测试记录失败')
    }
    return record
  }

  /**
   * 保存单个测试结果
   */
  async function saveResult(recordId: number, result: TestResultInput): Promise<ModelTestResult> {
    const now = new Date().toISOString()
    const [saved] = await db.insert(modelTestResults).values({
      recordId,
      aimodelId: result.aimodelId,
      upstreamId: result.upstreamId,
      status: result.status,
      responseTime: result.responseTime ?? null,
      responsePreview: result.responsePreview ?? null,
      errorMessage: result.errorMessage ?? null,
      createdAt: now,
    }).returning()

    if (!saved) {
      throw new Error('保存测试结果失败')
    }

    // 更新记录统计
    await updateRecordStats(recordId)

    return saved
  }

  /**
   * 更新记录统计
   */
  async function updateRecordStats(recordId: number): Promise<void> {
    const results = await db.query.modelTestResults.findMany({
      where: eq(modelTestResults.recordId, recordId),
    })

    const totalCount = results.length
    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length

    await db.update(modelTestRecords)
      .set({ totalCount, successCount, failedCount })
      .where(eq(modelTestRecords.id, recordId))
  }

  /**
   * 获取记录列表
   */
  async function listRecords(
    userId: number,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ records: ModelTestRecord[]; total: number }> {
    const records = await db.query.modelTestRecords.findMany({
      where: eq(modelTestRecords.userId, userId),
      orderBy: [desc(modelTestRecords.createdAt)],
      limit,
      offset,
    })

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(modelTestRecords)
      .where(eq(modelTestRecords.userId, userId))

    return { records, total: countResult?.count ?? 0 }
  }

  /**
   * 获取记录详情（含结果）
   */
  async function getRecordWithResults(
    recordId: number,
    userId: number
  ): Promise<RecordWithResults | undefined> {
    const record = await db.query.modelTestRecords.findFirst({
      where: and(
        eq(modelTestRecords.id, recordId),
        eq(modelTestRecords.userId, userId)
      ),
    })

    if (!record) return undefined

    const results = await db.query.modelTestResults.findMany({
      where: eq(modelTestResults.recordId, recordId),
    })

    return { ...record, results }
  }

  /**
   * 获取指定分类的所有模型（用于测试）
   */
  async function getModelsForTest(
    userId: number,
    category: ModelCategory
  ): Promise<TestModelInfo[]> {
    // 获取用户所有启用的上游
    const userUpstreams = await db.query.upstreams.findMany({
      where: and(
        eq(upstreams.userId, userId),
        isNull(upstreams.deletedAt),
        eq(upstreams.disabled, false)
      ),
      orderBy: [asc(upstreams.sortOrder), asc(upstreams.id)],
    })

    const result: TestModelInfo[] = []

    for (const upstream of userUpstreams) {
      // 获取该上游下指定分类的所有模型
      const models = await db.query.aimodels.findMany({
        where: and(
          eq(aimodels.upstreamId, upstream.id),
          eq(aimodels.category, category),
          isNull(aimodels.deletedAt)
        ),
        orderBy: [asc(aimodels.sortOrder), asc(aimodels.id)],
      })

      for (const model of models) {
        result.push({
          aimodelId: model.id,
          upstreamId: upstream.id,
          upstreamName: upstream.name,
          modelName: model.modelName,
          name: model.name,
          modelType: model.modelType,
          apiFormat: model.apiFormat,
          keyName: model.keyName,
          baseUrl: upstream.baseUrl,
          apiKeys: upstream.apiKeys,
        })
      }
    }

    return result
  }

  /**
   * 删除测试记录
   */
  async function deleteRecord(recordId: number, userId: number): Promise<boolean> {
    // 先验证记录属于该用户
    const record = await db.query.modelTestRecords.findFirst({
      where: and(
        eq(modelTestRecords.id, recordId),
        eq(modelTestRecords.userId, userId)
      ),
    })

    if (!record) return false

    // 删除关联的结果
    await db.delete(modelTestResults)
      .where(eq(modelTestResults.recordId, recordId))

    // 删除记录
    await db.delete(modelTestRecords)
      .where(eq(modelTestRecords.id, recordId))

    return true
  }

  return {
    createRecord,
    saveResult,
    updateRecordStats,
    listRecords,
    getRecordWithResults,
    getModelsForTest,
    deleteRecord,
  }
}

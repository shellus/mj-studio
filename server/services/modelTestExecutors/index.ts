/**
 * 模型测试执行器入口
 */

/** 测试执行结果 */
export interface TestExecuteResult {
  status: 'success' | 'failed'
  responseTime: number
  responsePreview?: string
  errorMessage?: string
}

export { testChatModel } from './chat'
export { testMediaModel, testSyncImageModel, testAsyncModel } from './media'

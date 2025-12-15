// MJ API 服务封装
// 兼容多个中转站，只需更换 BASE_URL 和 API Key

interface MJSubmitResponse {
  code: number
  description: string
  result: string // task ID
  properties?: Record<string, unknown>
}

interface MJButton {
  customId: string
  emoji: string
  label: string
  style: number
  type: number
}

interface MJTaskResponse {
  id: string
  action: string
  prompt: string
  promptEn: string
  description: string
  status: 'NOT_START' | 'SUBMITTED' | 'MODAL' | 'IN_PROGRESS' | 'FAILURE' | 'SUCCESS'
  progress: string
  imageUrl: string
  failReason: string
  buttons: MJButton[]
  submitTime: number
  startTime: number
  finishTime: number
  properties?: Record<string, unknown>
}

// 工厂函数：根据配置创建MJ服务实例
export function createMJService(baseUrl: string, apiKey: string) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // 提交 Imagine 任务 (文生图/垫图)
  async function imagine(prompt: string, base64Array: string[] = []): Promise<MJSubmitResponse> {
    const response = await $fetch<MJSubmitResponse>(`${baseUrl}/mj/submit/imagine`, {
      method: 'POST',
      headers,
      body: { prompt, base64Array },
    })
    // API可能返回字符串，需要手动解析
    if (typeof response === 'string') {
      return JSON.parse(response)
    }
    return response
  }

  // 提交 Blend 任务 (图片混合)
  async function blend(base64Array: string[], dimensions: 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE' = 'SQUARE'): Promise<MJSubmitResponse> {
    const response = await $fetch<MJSubmitResponse>(`${baseUrl}/mj/submit/blend`, {
      method: 'POST',
      headers,
      body: { base64Array, dimensions },
    })
    return response
  }

  // 执行按钮动作 (U1-U4, V1-V4, 🔄)
  async function action(taskId: string, customId: string): Promise<MJSubmitResponse> {
    const response = await $fetch<MJSubmitResponse>(`${baseUrl}/mj/submit/action`, {
      method: 'POST',
      headers,
      body: { taskId, customId },
    })
    return response
  }

  // 查询任务状态
  async function fetchTask(taskId: string): Promise<MJTaskResponse> {
    const response = await $fetch<MJTaskResponse>(`${baseUrl}/mj/task/${taskId}/fetch`, {
      method: 'GET',
      headers,
    })
    return response
  }

  return {
    imagine,
    blend,
    action,
    fetchTask,
  }
}

export type { MJSubmitResponse, MJTaskResponse, MJButton }

// MJ API 服务封装
// 兼容多个中转站，只需更换 BASE_URL 和 API Key

import { logTaskRequest, logTaskResponse } from '../utils/httpLogger'

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
  async function imagine(prompt: string, base64Array: string[] = [], taskId?: number): Promise<MJSubmitResponse> {
    const url = `${baseUrl}/mj/submit/imagine`
    const body = { prompt, base64Array }
    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body,
      })
    }

    try {
      const response = await $fetch<MJSubmitResponse>(url, {
        method: 'POST',
        headers,
        body,
      })

      const result = typeof response === 'string' ? JSON.parse(response) : response

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: result,
          durationMs: Date.now() - startTime,
        })
      }

      return result
    } catch (error: any) {
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
        })
      }
      throw error
    }
  }

  // 提交 Blend 任务 (图片混合)
  async function blend(base64Array: string[], dimensions: 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE' = 'SQUARE', taskId?: number): Promise<MJSubmitResponse> {
    const url = `${baseUrl}/mj/submit/blend`
    const body = { base64Array, dimensions }
    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, {
        url,
        method: 'POST',
        headers,
        body,
      })
    }

    try {
      const response = await $fetch<MJSubmitResponse>(url, {
        method: 'POST',
        headers,
        body,
      })

      const result = typeof response === 'string' ? JSON.parse(response) : response

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: result,
          durationMs: Date.now() - startTime,
        })
      }

      return result
    } catch (error: any) {
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
        })
      }
      throw error
    }
  }

  // 执行按钮动作 (U1-U4, V1-V4, 🔄)
  async function action(parentTaskId: string, customId: string, taskId?: number): Promise<MJSubmitResponse> {
    const url = `${baseUrl}/mj/submit/action`
    const body = { taskId: parentTaskId, customId }
    const startTime = Date.now()

    if (taskId) {
      logTaskRequest(taskId, { url, method: 'POST', headers, body })
    }

    try {
      const response = await $fetch<MJSubmitResponse>(url, {
        method: 'POST',
        headers,
        body,
      })

      const result = typeof response === 'string' ? JSON.parse(response) : response

      if (taskId) {
        logTaskResponse(taskId, {
          status: 200,
          statusText: 'OK',
          body: result,
          durationMs: Date.now() - startTime,
        })
      }

      return result
    } catch (error: any) {
      if (taskId) {
        logTaskResponse(taskId, {
          status: error.status || error.statusCode || null,
          statusText: error.statusText || error.statusMessage,
          body: error.data,
          error: error.message,
          errorType: error.name || 'Error',
          durationMs: Date.now() - startTime,
        })
      }
      throw error
    }
  }

  // 查询任务状态
  async function fetchTask(mjTaskId: string): Promise<MJTaskResponse> {
    const response = await $fetch<MJTaskResponse>(`${baseUrl}/mj/task/${mjTaskId}/fetch`, {
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

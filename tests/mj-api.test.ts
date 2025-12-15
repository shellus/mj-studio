// MJ API 集成测试
import { describe, it, expect } from 'vitest'

const BASE_URL = 'https://api.bltcy.ai/mj-fast'
const API_KEY = 'sk-PpICj5hxcUgnKhVfYWQiiTXjCsf0GMQuxRW0Avkh9YGvfiOm'

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
}

interface MJSubmitResponse {
  code: number
  description: string
  result: string
}

interface MJTaskResponse {
  id: string
  status: string
  progress: string
  imageUrl: string
  buttons: Array<{ customId: string; label: string; emoji: string }>
  failReason: string
}

// 轮询任务状态直到完成
async function pollTaskUntilDone(taskId: string, maxWaitMs = 120000): Promise<MJTaskResponse> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${BASE_URL}/mj/task/${taskId}/fetch`, { headers })
    const task: MJTaskResponse = await response.json()

    console.log(`[${taskId}] 状态: ${task.status}, 进度: ${task.progress}`)

    if (task.status === 'SUCCESS') {
      return task
    }
    if (task.status === 'FAILURE') {
      throw new Error(`任务失败: ${task.failReason}`)
    }

    // 等待 3 秒后再次查询
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  throw new Error('任务超时')
}

describe('MJ API 集成测试', () => {
  it('应该能够提交 imagine 任务并获取结果', async () => {
    // 1. 提交 imagine 任务
    console.log('提交 imagine 任务...')
    const submitResponse = await fetch(`${BASE_URL}/mj/submit/imagine`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'a cute cat, simple illustration --v 6.1',
        base64Array: [],
      }),
    })

    const submitResult: MJSubmitResponse = await submitResponse.json()
    console.log('提交结果:', submitResult)

    expect(submitResult.code).toBe(1)
    expect(submitResult.result).toBeTruthy()

    const taskId = submitResult.result
    console.log(`任务ID: ${taskId}`)

    // 2. 轮询任务状态直到完成
    console.log('等待任务完成...')
    const task = await pollTaskUntilDone(taskId)

    // 3. 验证结果
    expect(task.status).toBe('SUCCESS')
    expect(task.imageUrl).toBeTruthy()
    expect(task.buttons.length).toBeGreaterThan(0)

    console.log('任务完成!')
    console.log('图片URL:', task.imageUrl)
    console.log('可用按钮:', task.buttons.map(b => b.label || b.emoji).join(', '))
  })

  it('应该能够查询任务状态', async () => {
    // 提交一个简单任务
    const submitResponse = await fetch(`${BASE_URL}/mj/submit/imagine`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'test --v 6.1',
        base64Array: [],
      }),
    })

    const submitResult: MJSubmitResponse = await submitResponse.json()
    expect(submitResult.code).toBe(1)

    // 查询任务状态
    const fetchResponse = await fetch(`${BASE_URL}/mj/task/${submitResult.result}/fetch`, { headers })
    const task: MJTaskResponse = await fetchResponse.json()

    expect(task.id).toBe(submitResult.result)
    expect(['NOT_START', 'SUBMITTED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']).toContain(task.status)

    console.log('任务状态:', task.status)
  })
})

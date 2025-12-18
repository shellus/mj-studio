// API 集成测试 - 测试应用核心功能流程
import { describe, it, expect } from 'vitest'

const BASE_URL = 'http://localhost:3000'

// 存储测试会话的 Cookie
let sessionCookie = ''
let testModelConfigId = 0
let testTaskId = 0

// 辅助函数：发起带 Cookie 的请求
async function fetchWithSession(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (sessionCookie) {
    headers.set('Cookie', sessionCookie)
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  // 保存 Set-Cookie
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0]
  }

  return response
}

describe('用户认证流程', () => {
  const testEmail = `test_${Date.now()}@example.com`
  const testPassword = 'TestPass123'
  const testName = '测试用户'

  it('应能注册新用户', async () => {
    const response = await fetchWithSession('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    })

    const data = await response.json()
    console.log('注册响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe(testEmail)
  })

  it('应能登录已注册用户', async () => {
    const response = await fetchWithSession('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    })

    const data = await response.json()
    console.log('登录响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user).toBeDefined()
  })

  it('登录后应能访问受保护资源', async () => {
    const response = await fetchWithSession('/api/tasks')

    expect(response.status).toBe(200)
    const data = await response.json()
    // API 返回分页结构
    expect(data.tasks).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)
  })
})

describe('模型配置管理', () => {
  it('应能创建模型配置', async () => {
    const response = await fetchWithSession('/api/model-configs', {
      method: 'POST',
      body: JSON.stringify({
        name: '测试配置',
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key-12345',
        isDefault: true,
        modelTypeConfigs: [
          {
            category: 'image',
            modelType: 'gemini',
            apiFormat: 'gemini',
            modelName: 'gemini-2.5-flash-image',
            estimatedTime: 30,
          },
        ],
      }),
    })

    const data = await response.json()
    console.log('创建配置响应:', data)

    expect(response.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.name).toBe('测试配置')
    testModelConfigId = data.id
  })

  it('应能获取创建的配置', async () => {
    const response = await fetchWithSession('/api/model-configs')
    const configs = await response.json()

    expect(response.status).toBe(200)
    expect(configs.length).toBeGreaterThan(0)

    const testConfig = configs.find((c: { id: number }) => c.id === testModelConfigId)
    expect(testConfig).toBeDefined()
    expect(testConfig.name).toBe('测试配置')
  })

  it('应能更新模型配置', async () => {
    const response = await fetchWithSession(`/api/model-configs/${testModelConfigId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: '更新后的配置',
        baseUrl: 'https://api.example.com/v2',
        apiKey: 'updated-key',
        isDefault: true,
        modelTypeConfigs: [
          {
            category: 'image',
            modelType: 'gemini',
            apiFormat: 'gemini',
            modelName: 'gemini-2.5-flash-image',
            estimatedTime: 45,
          },
        ],
      }),
    })

    const data = await response.json()
    console.log('更新配置响应:', data)

    expect(response.status).toBe(200)
    expect(data.name).toBe('更新后的配置')
  })
})

describe('任务创建与管理', () => {
  it('应能创建绘图任务', async () => {
    const response = await fetchWithSession('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试提示词：一只可爱的小猫',
        base64Array: [],
        type: 'imagine',
        modelConfigId: testModelConfigId,
        modelType: 'gemini',
        apiFormat: 'gemini',
        modelName: 'gemini-2.5-flash-image',
      }),
    })

    const data = await response.json()
    console.log('创建任务响应:', data)

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.taskId).toBeDefined()
    testTaskId = data.taskId
  })

  it('应能获取任务详情', async () => {
    const response = await fetchWithSession(`/api/tasks/${testTaskId}`)
    const task = await response.json()

    console.log('任务详情:', task)

    expect(response.status).toBe(200)
    expect(task.id).toBe(testTaskId)
    expect(task.prompt).toBe('测试提示词：一只可爱的小猫')
    expect(task.modelType).toBe('gemini')
  })

  it('应能获取任务列表', async () => {
    const response = await fetchWithSession('/api/tasks')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tasks).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data.tasks.length).toBeGreaterThan(0)

    const testTask = data.tasks.find((t: { id: number }) => t.id === testTaskId)
    expect(testTask).toBeDefined()
  })

  it('应能查询任务日志（新任务可能无日志）', async () => {
    const response = await fetchWithSession(`/api/tasks/${testTaskId}/logs`)

    // 新创建的任务可能还没有日志，404 是正常的
    expect([200, 404]).toContain(response.status)

    if (response.status === 200) {
      const data = await response.json()
      // logs API 返回 { request: any, response: any }
      expect(data).toBeDefined()
    }
  })

  it('应能删除任务（移到回收站）', async () => {
    const response = await fetchWithSession(`/api/tasks/${testTaskId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('应能在回收站中找到已删除任务', async () => {
    const response = await fetchWithSession('/api/tasks/trash')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tasks).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)

    const deletedTask = data.tasks.find((t: { id: number }) => t.id === testTaskId)
    expect(deletedTask).toBeDefined()
  })

  it('应能从回收站恢复任务', async () => {
    const response = await fetchWithSession(`/api/tasks/${testTaskId}/restore`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('恢复后任务应在列表中', async () => {
    const response = await fetchWithSession('/api/tasks')
    const data = await response.json()

    const restoredTask = data.tasks.find((t: { id: number }) => t.id === testTaskId)
    expect(restoredTask).toBeDefined()
  })
})

describe('任务参数验证', () => {
  it('缺少模型配置时应返回错误', async () => {
    const response = await fetchWithSession('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试',
        modelType: 'gemini',
        apiFormat: 'gemini',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('模型配置')
  })

  it('无效模型类型应返回错误', async () => {
    const response = await fetchWithSession('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试',
        modelConfigId: testModelConfigId,
        modelType: 'invalid-type',
        apiFormat: 'gemini',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('模型类型')
  })

  it('无效 API 格式应返回错误', async () => {
    const response = await fetchWithSession('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: '测试',
        modelConfigId: testModelConfigId,
        modelType: 'gemini',
        apiFormat: 'invalid-format',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('API格式')
  })
})

describe('清理测试数据', () => {
  it('应能永久删除任务', async () => {
    // 先移到回收站
    await fetchWithSession(`/api/tasks/${testTaskId}`, { method: 'DELETE' })

    // 清空回收站
    const response = await fetchWithSession('/api/tasks/trash/empty', {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
  })

  it('应能删除模型配置', async () => {
    const response = await fetchWithSession(`/api/model-configs/${testModelConfigId}`, {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
  })

  it('应能登出', async () => {
    const response = await fetchWithSession('/api/auth/logout', {
      method: 'POST',
    })

    expect(response.status).toBe(200)
  })

  it('登出后应无法访问受保护资源', async () => {
    // 清除 cookie
    sessionCookie = ''
    const response = await fetchWithSession('/api/tasks')

    expect(response.status).toBe(401)
  })
})

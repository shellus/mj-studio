# mjcli 实施计划

## 概述

实现命令行工具 `@shellus/mjcli`，分为两部分：
1. **服务端**：扩展 `/api/external/` HTTP API 接口
2. **CLI 包**：独立 npm 包，纯 HTTP 客户端

## 阶段划分

### 阶段 1：服务端 HTTP API 扩展

#### 步骤 1.1：创建 MCP 结果解包工具函数

**文件**：`server/utils/external-api.ts`（新建）

**内容**：
```typescript
/**
 * 解包 MCP Tool Result 格式为 HTTP API 数据
 */
export function unwrapMcpResult(mcpResult: {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}): { data: any; isError: boolean } {
  const text = mcpResult.content[0].text
  const data = JSON.parse(text)
  const isError = mcpResult.isError || false
  return { data, isError }
}
```

**验证**：无需测试，工具函数。

---

#### 步骤 1.2：实现 GET /api/external/models

**文件**：`server/api/external/models.get.ts`（新建）

**内容**：
```typescript
import { requireApiKeyAuth } from '../../utils/jwt'
import { listModels } from '../../services/mcp/tools/list-models'
import { unwrapMcpResult } from '../../utils/external-api'
import type { ModelCategory } from '../../../app/shared/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)
  const { category } = getQuery(event) as { category?: string }

  const mcpResult = await listModels(user, category as ModelCategory)
  const { data, isError } = unwrapMcpResult(mcpResult)

  if (isError) {
    setResponseStatus(event, 400)
    return { status: 'error', error: data.error }
  }

  return { status: 'ok', data }
})
```

**验证**：
```bash
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/external/models
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/external/models?category=image
```

---

#### 步骤 1.3：实现 GET /api/external/assistants

**文件**：`server/api/external/assistants.get.ts`（新建）

**内容**：
```typescript
import { requireApiKeyAuth } from '../../utils/jwt'
import { listAssistants } from '../../services/mcp/tools/list-assistants'
import { unwrapMcpResult } from '../../utils/external-api'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)

  const mcpResult = await listAssistants(user)
  const { data } = unwrapMcpResult(mcpResult)

  return { status: 'ok', data }
})
```

**验证**：
```bash
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/external/assistants
```

---

#### 步骤 1.4：实现 POST /api/external/image

**文件**：`server/api/external/image.post.ts`（新建）

**内容**：
```typescript
import { requireApiKeyAuth } from '../../utils/jwt'
import { generateImage } from '../../services/mcp/tools/generate-image'
import { unwrapMcpResult } from '../../utils/external-api'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)
  const body = await readBody(event)

  const {
    aimodelId,
    prompt,
    images,
    modelParams,
    blocking = true,
  } = body

  if (!aimodelId || !prompt?.trim()) {
    setResponseStatus(event, 400)
    return { status: 'error', error: '缺少必填参数' }
  }

  const mcpResult = await generateImage(
    user,
    aimodelId,
    prompt,
    images,
    modelParams,
    blocking,
  )

  const { data, isError } = unwrapMcpResult(mcpResult)

  if (isError) {
    setResponseStatus(event, 400)
    return { status: 'error', error: data.error }
  }

  return { status: 'ok', data }
})
```

**验证**：
```bash
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"aimodelId":5,"prompt":"测试图片","blocking":false}' \
  http://localhost:3000/api/external/image
```

---

#### 步骤 1.5：实现 POST /api/external/video

**文件**：`server/api/external/video.post.ts`（新建）

**内容**：与 `image.post.ts` 类似，调用 `generateVideo()`。

**验证**：类似 image 接口。

---

#### 步骤 1.6：实现 GET /api/external/tasks

**文件**：`server/api/external/tasks.get.ts`（新建）

**内容**：
```typescript
import { requireApiKeyAuth } from '../../utils/jwt'
import { listTasks } from '../../services/mcp/tools/list-tasks'
import { unwrapMcpResult } from '../../utils/external-api'
import type { TaskType, TaskStatus } from '../../../app/shared/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)
  const query = getQuery(event)

  const taskType = query.type as TaskType | undefined
  const status = query.status as TaskStatus | undefined
  const limit = query.limit ? Number(query.limit) : undefined

  const mcpResult = await listTasks(user, taskType, status, limit)
  const { data } = unwrapMcpResult(mcpResult)

  return { status: 'ok', data }
})
```

**验证**：
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/external/tasks?type=image&status=success&limit=5"
```

---

#### 步骤 1.7：实现 GET /api/external/tasks/[id]

**文件**：`server/api/external/tasks/[id].get.ts`（新建）

**内容**：
```typescript
import { requireApiKeyAuth } from '../../../utils/jwt'
import { getTask } from '../../../services/mcp/tools/get-task'
import { unwrapMcpResult } from '../../../utils/external-api'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    setResponseStatus(event, 400)
    return { status: 'error', error: '无效的任务 ID' }
  }

  const mcpResult = await getTask(user, id)
  const { data, isError } = unwrapMcpResult(mcpResult)

  if (isError) {
    setResponseStatus(event, 404)
    return { status: 'error', error: data.error }
  }

  return { status: 'ok', data }
})
```

**验证**：
```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/external/tasks/12345
```

---

#### 步骤 1.8：实现 POST /api/external/upload

**文件**：`server/api/external/upload.post.ts`（新建）

**内容**：复用 `/api/mcp/upload.post.ts` 的文件保存逻辑，但使用 API Key 认证而非临时 JWT。

```typescript
import { requireApiKeyAuth } from '../../utils/jwt'
import { saveFile, getFileUrl } from '../../services/file'
import { getFullResourceUrl } from '../../utils/url'

export default defineEventHandler(async (event) => {
  const { user } = await requireApiKeyAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    setResponseStatus(event, 400)
    return { status: 'error', error: '缺少文件数据' }
  }

  const fileField = formData.find(f => f.name === 'file')
  if (!fileField || !fileField.data) {
    setResponseStatus(event, 400)
    return { status: 'error', error: '缺少文件数据' }
  }

  const result = saveFile(
    fileField.data,
    fileField.filename || 'unknown',
    fileField.type || 'application/octet-stream',
  )

  if (!result) {
    setResponseStatus(event, 500)
    return { status: 'error', error: '保存文件失败' }
  }

  const localUrl = getFileUrl(result.fileName)
  const url = getFullResourceUrl(localUrl) || localUrl

  return { status: 'ok', data: { url } }
})
```

**验证**：
```bash
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -F "file=@./test.jpg" \
  http://localhost:3000/api/external/upload
```

---

#### 步骤 1.9：更新 HTTP API 文档

**文件**：`docs/features/HTTP API接口介绍.md`

**修改**：在文档末尾补充新增接口的说明（参考 MCP 接口文档格式）。

---

### 阶段 2：CLI 包实现

#### 步骤 2.1：初始化 CLI 项目

**位置**：在 `/data/projects/` 下新建 `mjcli/` 目录（与 `mj-studio/` 平级）

**操作**：
```bash
cd /data/projects
mkdir mjcli && cd mjcli
npm init -y
```

**修改 package.json**：
```json
{
  "name": "@shellus/mjcli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "mjcli": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

**创建 tsconfig.json**：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

---

#### 步骤 2.2：实现配置模块

**文件**：`src/config.ts`

**内容**：
```typescript
export const config = {
  url: process.env.MJCLI_URL || '',
  key: process.env.MJCLI_KEY || '',
}

export function validateConfig() {
  if (!config.url) {
    console.error('错误：未设置 MJCLI_URL 环境变量')
    process.exit(1)
  }
  if (!config.key) {
    console.error('错误：未设置 MJCLI_KEY 环境变量')
    process.exit(1)
  }
  if (!config.key.startsWith('mjs_')) {
    console.error('错误：MJCLI_KEY 格式无效（应以 mjs_ 开头）')
    process.exit(1)
  }
}
```

---

#### 步骤 2.3：实现 HTTP 请求模块

**文件**：`src/api.ts`

**内容**：
```typescript
import { config } from './config.js'

export async function request(
  method: string,
  path: string,
  body?: any,
): Promise<any> {
  const url = config.url + path
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.key}`,
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : JSON.stringify(body),
  })

  // 认证失败
  if (res.status === 401) {
    console.error('认证失败：API Key 无效')
    process.exit(2)
  }

  const json = await res.json()

  // 业务错误
  if (json.status === 'error') {
    console.error(`错误：${json.error}`)
    process.exit(1)
  }

  return json.data
}
```

---

#### 步骤 2.4：实现输出模块

**文件**：`src/output.ts`

**内容**：
```typescript
const isTTY = process.stdout.isTTY

export function output(data: any, forceJson = false, forcePretty = false) {
  if (forceJson || (!forcePretty && !isTTY)) {
    console.log(JSON.stringify(data))
  } else {
    prettyPrint(data)
  }
}

function prettyPrint(data: any) {
  // 简单实现：表格或列表输出
  if (Array.isArray(data)) {
    data.forEach(item => console.log(JSON.stringify(item, null, 2)))
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}
```

---

#### 步骤 2.5：实现文件上传模块

**文件**：`src/upload.ts`

**内容**：
```typescript
import fs from 'fs'
import { request } from './api.js'

export async function uploadFile(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在：${filePath}`)
    process.exit(1)
  }

  const formData = new FormData()
  const fileBuffer = fs.readFileSync(filePath)
  const blob = new Blob([fileBuffer])
  formData.append('file', blob, filePath.split('/').pop())

  const data = await request('POST', '/api/external/upload', formData)
  return data.url
}
```

---

#### 步骤 2.6：实现命令模块（分段输出）

**文件**：`src/commands/model.ts`

**内容**：
```typescript
import { request } from '../api.js'
import { output } from '../output.js'

export async function listModels(type?: string, options?: any) {
  const query = type ? `?category=${type}` : ''
  const data = await request('GET', `/api/external/models${query}`)
  output(data, options.json, options.pretty)
}
```

**文件**：`src/commands/assistant.ts`

**内容**：
```typescript
import { request } from '../api.js'
import { output } from '../output.js'

export async function listAssistants(options?: any) {
  const data = await request('GET', '/api/external/assistants')
  output(data, options.json, options.pretty)
}
```

---

#### 步骤 2.7：实现 chat 命令

**文件**：`src/commands/chat.ts`

**内容**：
```typescript
import { request } from '../api.js'
import { output } from '../output.js'

export async function chat(
  message: string,
  options: {
    assistant: number
    conversation?: number
    model?: number
    title?: string
    persistent?: boolean
    json?: boolean
    pretty?: boolean
  },
) {
  const body = {
    assistantId: options.assistant,
    message,
    conversationId: options.conversation,
    aimodelId: options.model,
    title: options.title,
    persistent: options.persistent,
    stream: false, // CLI 始终非流式
  }

  const data = await request('POST', '/api/external/chat', body)
  output(data, options.json, options.pretty)
}
```

---

#### 步骤 2.8：实现 image 命令

**文件**：`src/commands/image.ts`

**内容**：
```typescript
import { request } from '../api.js'
import { output } from '../output.js'
import { uploadFile } from '../upload.js'

export async function generateImage(
  prompt: string,
  options: {
    model: number
    ref?: string[]
    async?: boolean
    output?: string
    json?: boolean
    pretty?: boolean
    [key: string]: any
  },
) {
  // 上传参考图
  let images: string[] | undefined
  if (options.ref && options.ref.length > 0) {
    images = await Promise.all(options.ref.map(uploadFile))
  }

  // 提取模型参数
  const modelParams: Record<string, any> = {}
  const knownParams = ['negativePrompt', 'size', 'aspectRatio', 'quality', 'style']
  knownParams.forEach(key => {
    if (options[key]) modelParams[key] = options[key]
  })

  const body = {
    aimodelId: options.model,
    prompt,
    images,
    modelParams: Object.keys(modelParams).length > 0 ? modelParams : undefined,
    blocking: !options.async,
  }

  const data = await request('POST', '/api/external/image', body)

  // 下载到本地
  if (options.output && data.resourceUrl) {
    // TODO: 实现下载逻辑
  }

  output(data, options.json, options.pretty)
}
```

---

#### 步骤 2.9：实现 video 命令

**文件**：`src/commands/video.ts`

**内容**：类似 `image.ts`，调用 `/api/external/video`。

---

#### 步骤 2.10：实现 task 命令

**文件**：`src/commands/task.ts`

**内容**：
```typescript
import { request } from '../api.js'
import { output } from '../output.js'

export async function listTasks(options: {
  type?: string
  status?: string
  limit?: number
  json?: boolean
  pretty?: boolean
}) {
  const params = new URLSearchParams()
  if (options.type) params.set('type', options.type)
  if (options.status) params.set('status', options.status)
  if (options.limit) params.set('limit', String(options.limit))

  const query = params.toString() ? `?${params}` : ''
  const data = await request('GET', `/api/external/tasks${query}`)
  output(data, options.json, options.pretty)
}

export async function getTask(taskId: string, options?: any) {
  const data = await request('GET', `/api/external/tasks/${taskId}`)
  output(data, options.json, options.pretty)
}
```

---

#### 步骤 2.11：实现主入口

**文件**：`src/index.ts`

**内容**：
```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { validateConfig } from './config.js'
import { listModels } from './commands/model.js'
import { listAssistants } from './commands/assistant.js'
import { chat } from './commands/chat.js'
import { generateImage } from './commands/image.js'
import { generateVideo } from './commands/video.js'
import { listTasks, getTask } from './commands/task.js'

validateConfig()

const program = new Command()

program
  .name('mjcli')
  .description('MJ Studio CLI')
  .version('0.1.0')

// model 命令
program
  .command('model')
  .description('模型管理')
  .command('ls')
  .option('-t, --type <type>', '模型类型')
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(listModels)

// assistant 命令
program
  .command('assistant')
  .description('助手管理')
  .command('ls')
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(listAssistants)

// chat 命令
program
  .command('chat <message>')
  .description('AI 对话')
  .requiredOption('-a, --assistant <id>', '助手 ID', parseInt)
  .option('-c, --conversation <id>', '对话 ID', parseInt)
  .option('-m, --model <id>', '模型 ID', parseInt)
  .option('--title <title>', '对话标题')
  .option('--persistent', '永久保留')
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(chat)

// image 命令
program
  .command('image <prompt>')
  .description('生成图片')
  .requiredOption('-m, --model <id>', '模型 ID', parseInt)
  .option('-r, --ref <path>', '参考图路径', (val, prev) => [...(prev || []), val], [])
  .option('--async', '异步模式')
  .option('-o, --output <path>', '下载路径')
  .option('--negative-prompt <text>', '负面提示词')
  .option('--size <size>', '尺寸')
  .option('--aspect-ratio <ratio>', '宽高比')
  .option('--quality <quality>', '质量')
  .option('--style <style>', '风格')
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(generateImage)

// video 命令（类似 image）
// ...

// task 命令
const taskCmd = program.command('task').description('任务管理')

taskCmd
  .command('ls')
  .option('-t, --type <type>', '任务类型')
  .option('-s, --status <status>', '状态')
  .option('-l, --limit <num>', '数量', parseInt)
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(listTasks)

taskCmd
  .command('get <taskId>')
  .option('--json', '输出 JSON')
  .option('--pretty', '人类可读输出')
  .action(getTask)

program.parse()
```

---

### 阶段 3：测试与文档

#### 步骤 3.1：服务端集成测试

**文件**：`tests/external-api.test.ts`（新建）

**内容**：参考 `tests/api-integration.test.ts`，测试新增的 7 个接口。

---

#### 步骤 3.2：CLI 手动测试

在本地运行：
```bash
cd /data/projects/mjcli
pnpm build
export MJCLI_URL=http://localhost:3000
export MJCLI_KEY=mjs_xxx
node dist/index.js model ls
node dist/index.js chat -a 1 "你好"
```

---

#### 步骤 3.3：更新 README

**文件**：`/data/projects/mj-studio/README.md`

在文档索引中添加：
```markdown
- [CLI 工具介绍](docs/features/CLI工具介绍.md)
```

---

## 验收标准

1. 服务端 7 个新接口全部可用，返回格式正确
2. CLI 所有命令可正常执行，输出格式符合预期
3. TTY 检测正常工作
4. 文件上传功能正常
5. 错误处理和退出码正确
6. 文档完整更新

---

## 风险与注意事项

1. **MCP 工具函数的返回格式**：已确认所有工具返回 `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`，解包逻辑统一
2. **文件上传认证**：HTTP API 直接用 API Key，无需临时 JWT
3. **CLI 依赖最小化**：仅依赖 commander，其他功能用 Node 内置 API
4. **测试覆盖**：服务端接口需要集成测试，CLI 手动测试即可

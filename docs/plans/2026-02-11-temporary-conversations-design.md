# 临时对话功能设计

**设计日期**：2026-02-11
**状态**：待实施

## 需求背景

通过 API/MCP 创建的对话默认为临时对话，1 小时后自动清理，减少数据库冗余。用户可通过 `persistent` 参数选择永久保留。

## 核心设计

### 1. 数据库设计

**Schema 变更**（`server/database/schema.ts`）：

```typescript
// conversations 表增加字段
expiresAt: integer('expires_at', { mode: 'timestamp' })
// null = 永久对话
// 有值 = 临时对话到期时间
```

**迁移策略**：

```sql
-- 添加字段
ALTER TABLE conversations ADD COLUMN expires_at INTEGER;

-- 添加索引（优化清理任务查询）
CREATE INDEX idx_conversations_expires_at
ON conversations(expires_at)
WHERE expires_at IS NOT NULL;
```

**迁移文件**：使用自定义迁移（不使用 `pnpm db:generate`）

```bash
pnpm drizzle-kit generate --custom --name=add-conversation-expires-at
```

### 2. API 接口设计

**MCP `chat` 工具参数扩展**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|------|--------|------|
| `persistent` | boolean | 否 | `false` | 是否永久保留对话 |

**HTTP API `/api/external/chat` 参数扩展**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|------|--------|------|
| `persistent` | boolean | 否 | `false` | 是否永久保留对话 |

**逻辑规则**：

1. **创建新对话时**：
   - `persistent = false` → `expiresAt = 当前时间 + 1 小时`
   - `persistent = true` → `expiresAt = null`（永久）

2. **继续已有对话时**：
   - 忽略 `persistent` 参数（不改变对话属性）
   - 如果对话是临时的（`expiresAt != null`），每次用户消息延期到"当前时间 + 1 小时"

3. **延期触发时机**：
   - 仅在创建用户消息（`role === 'user'`）后触发
   - AI 消息、工具调用等不触发延期

### 3. Service 层修改

**ConversationService 修改**（`server/services/conversation.ts`）：

**方法 1：创建对话**

```typescript
async create(data: {
  userId: number
  assistantId: number
  title: string
  persistent?: boolean  // 新增参数
}) {
  const expiresAt = data.persistent === false
    ? new Date(Date.now() + 60 * 60 * 1000)  // 1 小时后
    : null  // 永久

  const [conversation] = await db.insert(conversations).values({
    userId: data.userId,
    assistantId: data.assistantId,
    title: data.title,
    expiresAt,  // 新增字段
  }).returning()

  return conversation
}
```

**方法 2：添加消息（延期逻辑）**

```typescript
async addMessage(userId: number, data: {
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  // ... 其他字段
}) {
  const message = await db.insert(messages).values({...}).returning()

  // 仅用户消息延期临时对话
  if (data.role === 'user') {
    await this.extendExpirationIfTemporary(data.conversationId)
  }

  return message
}
```

**方法 3：延期临时对话**

```typescript
async extendExpirationIfTemporary(conversationId: number) {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { expiresAt: true }
  })

  // 只延期临时对话（expiresAt != null）
  if (conversation?.expiresAt) {
    const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await db.update(conversations)
      .set({ expiresAt: newExpiresAt })
      .where(eq(conversations.id, conversationId))
  }
}
```

### 4. 清理机制设计

**清理任务实现**（`server/tasks/cleanupExpiredConversations.ts`）：

```typescript
import { db } from '../database'
import { conversations } from '../database/schema'
import { and, isNotNull, lt } from 'drizzle-orm'
import { useConversationService } from '../services/conversation'

/**
 * 清理过期的临时对话
 * 删除 expiresAt < 当前时间 的对话及其关联消息
 */
export async function cleanupExpiredConversations() {
  const now = new Date()
  const conversationService = useConversationService()

  // 查找过期对话
  const expiredConversations = await db.query.conversations.findMany({
    where: and(
      isNotNull(conversations.expiresAt),
      lt(conversations.expiresAt, now)
    ),
    columns: { id: true }
  })

  // 删除对话（级联删除消息）
  for (const conv of expiredConversations) {
    await conversationService.delete(conv.id)
  }

  return expiredConversations.length
}
```

**调度实现**（`server/plugins/scheduledTasks.ts`）：

```typescript
import { cleanupExpiredConversations } from '../tasks/cleanupExpiredConversations'

export default defineNitroPlugin(() => {
  // 每 10 分钟执行一次清理
  const interval = setInterval(async () => {
    try {
      const count = await cleanupExpiredConversations()
      if (count > 0) {
        console.log(`[清理任务] 删除了 ${count} 个过期临时对话`)
      }
    } catch (err) {
      console.error('[清理任务] 执行失败:', err)
    }
  }, 10 * 60 * 1000) // 10 分钟

  // Nitro 关闭时清理定时器
  // @ts-ignore
  if (import.meta.dev) {
    process.on('beforeExit', () => clearInterval(interval))
  }
})
```

**清理间隔**：10 分钟（未来可通过环境变量 `NUXT_CLEANUP_INTERVAL_MINUTES` 配置）

### 5. API 接口实现修改

**MCP chat 工具**（`server/services/mcp/tools/chat.ts`）：

```typescript
export async function chat(
  user: AuthUser,
  assistantId: number,
  message: string,
  conversationId?: number,
  title?: string,
  stream?: boolean,
  persistent?: boolean,  // 新增参数
) {
  // ... 现有验证逻辑 ...

  let actualConversationId = conversationId

  if (!actualConversationId) {
    const newConversation = await conversationService.create({
      userId: user.id,
      assistantId,
      title: title || conversationService.generateTitle(message),
      persistent,  // 传递 persistent 参数
    })
    actualConversationId = newConversation.id
    await assistantService.refreshConversationCount(assistantId)
  } else {
    // 验证对话属于用户（现有逻辑保持不变）
    // ...
  }

  // ... 后续逻辑保持不变 ...
}
```

**HTTP API**（`server/api/external/chat.post.ts`）：

```typescript
const {
  assistantId,
  message,
  conversationId,
  title,
  stream,
  aimodelId,
  persistent  // 新增参数
} = body as {
  assistantId: number
  message: string
  conversationId?: number
  title?: string
  stream?: boolean
  aimodelId?: number
  persistent?: boolean  // 新增类型
}

// ... 参数验证 ...

if (!actualConversationId) {
  const newConversation = await conversationService.create({
    userId: user.id,
    assistantId,
    title: title || conversationService.generateTitle(message),
    persistent,  // 传递 persistent 参数
  })
  actualConversationId = newConversation.id
  await assistantService.refreshConversationCount(assistantId)
}
```

### 6. 文档更新

**需要更新的文档**：

1. **MCP 接口文档**（`docs/features/MCP接口功能介绍.md`）
   - `chat` 工具参数表格增加 `persistent` 字段说明

2. **HTTP API 文档**（`docs/features/HTTP API接口介绍.md`）
   - `/api/external/chat` 参数表格增加 `persistent` 字段说明

## 实施清单

- [ ] 数据库迁移
  - [ ] 创建迁移文件 `add-conversation-expires-at`
  - [ ] 添加 `expires_at` 字段
  - [ ] 添加索引 `idx_conversations_expires_at`
  - [ ] 执行迁移并验证

- [ ] Service 层修改
  - [ ] `ConversationService.create` 增加 `persistent` 参数
  - [ ] `ConversationService.addMessage` 增加延期逻辑
  - [ ] `ConversationService.extendExpirationIfTemporary` 新增方法

- [ ] 清理机制实现
  - [ ] 创建 `server/tasks/cleanupExpiredConversations.ts`
  - [ ] 创建 `server/plugins/scheduledTasks.ts`
  - [ ] 测试清理逻辑

- [ ] API 接口修改
  - [ ] MCP `chat` 工具增加 `persistent` 参数
  - [ ] HTTP API `/api/external/chat` 增加 `persistent` 参数

- [ ] 测试
  - [ ] 单元测试：ConversationService 延期逻辑
  - [ ] 集成测试：API/MCP 创建临时对话
  - [ ] 集成测试：清理任务删除过期对话
  - [ ] 手动测试：1 小时后验证自动清理

- [ ] 文档更新
  - [ ] 更新 MCP 接口文档
  - [ ] 更新 HTTP API 文档

## 技术决策

**为什么选择 1 小时作为默认过期时间？**
- 足够完成多轮对话（通常 API/MCP 调用是短期任务）
- 不会占用过多数据库空间
- 可通过代码常量调整（未来可配置化）

**为什么只有用户消息触发延期？**
- AI 消息是被动响应，不代表用户活跃
- 避免自动回复无限延长临时对话生命周期
- 更精准反映用户意图

**为什么不在 Web 端实现临时对话？**
- 简化设计，降低复杂度
- Web 端是主力工作环境，对话通常需要长期保留
- API/MCP 是临时调用场景，更适合临时对话

## 未来扩展

1. **可配置过期时间**：通过环境变量 `NUXT_TEMPORARY_CONVERSATION_TTL_HOURS` 配置
2. **Web 端临时对话**：如果用户需求强烈，可在创建对话时增加"临时"开关
3. **手动转永久**：Web 端对话列表增加"保存"按钮，将临时对话转为永久
4. **清理通知**：对话即将过期时，通过事件系统通知前端（如果用户在线）

## 风险与注意事项

1. **时区问题**：所有时间戳使用 UTC，避免时区混淆
2. **级联删除**：确保 `conversationService.delete` 正确删除关联消息
3. **并发问题**：定时任务与用户操作可能并发，需确保删除逻辑幂等
4. **测试覆盖**：清理逻辑需要充分测试，避免误删永久对话

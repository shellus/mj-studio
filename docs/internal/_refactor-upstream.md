# 重构计划：modelConfig → upstream + aimodels 子表

> **状态：已完成** ✅
>
> 完成时间：2025-12-26
>
> 此次重构成功将 `modelConfig` 重命名为 `upstream`，并将 `modelTypeConfigs` JSON 字段拆分为独立的 `aimodels` 子表。

## 背景

当前代码中，API 服务端点配置被命名为 `modelConfig`（模型配置），而实际存储的单个模型参数被命名为 `ModelTypeConfig`，且以 JSON 字段形式存储。这种设计存在以下问题：

1. **命名混淆**：`modelConfig` 实际是"上游配置"，`ModelTypeConfig` 才是"模型配置"
2. **JSON 存储的局限**：
   - 无法单独查询某个模型（如"查找所有 GPT-4 模型"）
   - 无法建立外键关联（任务只能关联上游，无法关联具体模型）
   - 数据冗余，每次更新上游都要操作整个 JSON

本次重构将：
1. 术语规范化：`modelConfig` → `upstream`
2. JSON 字段拆分为子表：`model_type_configs` JSON → `aimodels` 子表
3. `balance_*` → upstream_platform + user_api_key

当前数据库结构已导出在：docs/_current-schema.sql

## 新的数据模型

```
upstreams (上游表)
├── id
├── user_id
├── name (上游名称)
├── base_url (API 地址)
├── api_key (主 Key，兼容旧数据)
├── api_keys (多 Key 配置 JSON)
├── remark
├── is_default
├── upstream_platform (上游平台类型：oneapi/n1n/yunwu 等)
├── user_api_key (用户在该平台的 Key，用于余额查询等)
└── created_at

aimodels (模型表) - 新建子表，替代原 JSON 字段
├── id
├── upstream_id (外键 → upstreams.id)
├── category: 'image' | 'chat'
├── model_type: 'midjourney' | 'gpt' | 'claude' | ...
├── api_format: 'mj-proxy' | 'openai-chat' | ...
├── model_name: 实际模型名称
├── estimated_time: 预计时间（秒）
├── key_name: 使用的 Key 名称
└── created_at

tasks (任务表)
├── ...
├── aimodel_id (新外键 → aimodels.id)
└── upstream_id (保留，冗余字段便于查询)

messages (消息表)
├── ...
├── aimodel_id (新外键 → aimodels.id)
└── upstream_id (保留，冗余字段便于查询)

assistants (助手表)
├── ...
├── aimodel_id (新外键 → aimodels.id)
└── upstream_id (保留，冗余字段便于查询)
```

## 命名变更对照表

### 上游配置（API 服务端点）

| 位置 | 当前 | 变更为 |
|-----|------|-------|
| 数据库表名 | `model_configs` | `upstreams` |
| 类型名 | `ModelConfig`, `NewModelConfig` | `Upstream`, `NewUpstream` |
| 服务文件 | `modelConfig.ts` | `upstream.ts` |
| 服务函数 | `useModelConfigService()` | `useUpstreamService()` |
| Composable 文件 | `useModelConfigs.ts` | `useUpstreams.ts` |
| Composable 函数 | `useModelConfigs()` | `useUpstreams()` |
| API 路径 | `/api/model-configs/...` | `/api/upstreams/...` |
| UI 显示 | "模型配置" | "上游配置" |
| 字段 | `balance_api_type` | `upstream_platform` |
| 字段 | `balance_api_key` | `user_api_key` |
| 类型 | `BalanceApiType` | `UpstreamPlatform` |

### 模型配置（单个模型参数）

| 位置 | 当前 | 变更为 |
|-----|------|-------|
| 数据库 | JSON 字段 `model_type_configs` | 子表 `aimodels` |
| 类型名 | `ModelTypeConfig` | `Aimodel`, `NewAimodel` |
| 变量名 | `modelTypeConfigs` | `aimodels` |
| 变量名 | `imageModelConfigs` | `imageAimodels` |
| 变量名 | `chatModelConfigs` | `chatAimodels` |

### 外键字段变更

| 表 | 当前 | 变更为 |
|---|------|-------|
| `tasks` | `model_config_id` | `upstream_id` + `aimodel_id` |
| `messages` | `model_config_id` | `upstream_id` + `aimodel_id` |
| `assistants` | `model_config_id` | `upstream_id` + `aimodel_id` |

## 数据库变更详情

### 1. 重命名 model_configs → upstreams

```sql
ALTER TABLE `model_configs` RENAME TO `upstreams`;
```

### 2. 删除 JSON 字段（迁移数据后）

```sql
ALTER TABLE `upstreams` DROP COLUMN `model_type_configs`;
```

### 3. 创建 aimodels 子表

```sql
CREATE TABLE `aimodels` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `upstream_id` integer NOT NULL,
  `category` text NOT NULL,           -- 'image' | 'chat'
  `model_type` text NOT NULL,         -- 'midjourney' | 'gpt' | ...
  `api_format` text NOT NULL,         -- 'mj-proxy' | 'openai-chat' | ...
  `model_name` text NOT NULL,         -- 实际模型名称
  `estimated_time` integer,           -- 预计时间（秒）
  `key_name` text,                    -- 使用的 Key 名称
  `created_at` integer NOT NULL,
  FOREIGN KEY (`upstream_id`) REFERENCES `upstreams`(`id`) ON DELETE CASCADE
);
```

### 4. 修改关联表外键和字段重命名

```sql
-- upstreams 表字段重命名
ALTER TABLE `upstreams` RENAME COLUMN `balance_api_type` TO `upstream_platform`;
ALTER TABLE `upstreams` RENAME COLUMN `balance_api_key` TO `user_api_key`;

-- tasks 表
ALTER TABLE `tasks` RENAME COLUMN `model_config_id` TO `upstream_id`;
ALTER TABLE `tasks` ADD COLUMN `aimodel_id` integer;

-- messages 表
ALTER TABLE `messages` RENAME COLUMN `model_config_id` TO `upstream_id`;
ALTER TABLE `messages` ADD COLUMN `aimodel_id` integer;

-- assistants 表
ALTER TABLE `assistants` RENAME COLUMN `model_config_id` TO `upstream_id`;
ALTER TABLE `assistants` ADD COLUMN `aimodel_id` integer;
```

### 5. 数据迁移脚本

需要编写迁移脚本，将现有 JSON 数据迁移到子表：

```typescript
// 伪代码
for (const upstream of allUpstreams) {
  const models = JSON.parse(upstream.model_type_configs)
  for (const model of models) {
    await db.insert(aimodels).values({
      upstreamId: upstream.id,
      category: model.category || 'image',
      modelType: model.modelType,
      apiFormat: model.apiFormat,
      modelName: model.modelName,
      estimatedTime: model.estimatedTime,
      keyName: model.keyName,
    })
  }
}
```

## 文件修改清单

### 1. 文件重命名

| 当前路径 | 新路径 |
|---------|--------|
| `server/services/modelConfig.ts` | `server/services/upstream.ts` |
| `app/composables/useModelConfigs.ts` | `app/composables/useUpstreams.ts` |
| `server/api/model-configs/` | `server/api/upstreams/` |

### 2. 类型定义（app/shared/types.ts）

```typescript
// 变更前
export interface ModelTypeConfig {
  category?: ModelCategory
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  estimatedTime?: number
  keyName?: string
}

// 变更后（对应数据库表结构）
// Aimodel 类型将由 schema.ts 推导，此处可删除或保留为接口
```

### 3. 数据库 Schema（server/database/schema.ts）

```typescript
// upstreams 表（原 modelConfigs）
export const upstreams = sqliteTable('upstreams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  apiKeys: text('api_keys', { mode: 'json' }).$type<ApiKeyConfig[]>(),
  remark: text('remark'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  upstreamPlatform: text('upstream_platform').$type<UpstreamPlatform>(),
  userApiKey: text('user_api_key'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Upstream = typeof upstreams.$inferSelect
export type NewUpstream = typeof upstreams.$inferInsert

// aimodels 表（新建）
export const aimodels = sqliteTable('aimodels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  upstreamId: integer('upstream_id').notNull().references(() => upstreams.id, { onDelete: 'cascade' }),
  category: text('category').$type<ModelCategory>().notNull(),
  modelType: text('model_type').$type<ModelType>().notNull(),
  apiFormat: text('api_format').$type<ApiFormat>().notNull(),
  modelName: text('model_name').notNull(),
  estimatedTime: integer('estimated_time'),
  keyName: text('key_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Aimodel = typeof aimodels.$inferSelect
export type NewAimodel = typeof aimodels.$inferInsert

// tasks 表更新
export const tasks = sqliteTable('tasks', {
  // ...
  upstreamId: integer('upstream_id').notNull(),
  aimodelId: integer('aimodel_id'),
  // ...
})

// messages 表更新
export const messages = sqliteTable('messages', {
  // ...
  upstreamId: integer('upstream_id'),
  aimodelId: integer('aimodel_id'),
  // ...
})

// assistants 表更新
export const assistants = sqliteTable('assistants', {
  // ...
  upstreamId: integer('upstream_id'),
  aimodelId: integer('aimodel_id'),
  // ...
})
```

### 4. 后端服务层

**新增 server/services/aimodel.ts**:
- `useAimodelService()` - 模型 CRUD 服务

**server/services/upstream.ts**（原 modelConfig.ts）:
- 移除 JSON 字段相关逻辑
- 改为通过 aimodels 表查询关联模型

**其他服务文件需更新**:
- `server/services/task.ts` - 使用 `aimodelId` 关联
- `server/services/chat.ts` - 使用 `aimodelId` 关联
- `server/services/claude.ts`
- `server/services/streamingTask.ts`
- `server/services/conversation.ts`
- `server/services/assistant.ts`

### 5. API 路由

**目录重命名**: `server/api/model-configs/` → `server/api/upstreams/`

**新增 aimodels 相关路由**（可选，或嵌套在 upstreams 下）:
- `GET /api/upstreams/[id]/aimodels` - 获取上游的所有模型
- `POST /api/upstreams/[id]/aimodels` - 添加模型
- `PUT /api/aimodels/[id]` - 更新模型
- `DELETE /api/aimodels/[id]` - 删除模型

**路由变更**:
| 当前 | 变更为 |
|-----|-------|
| `GET /api/model-configs` | `GET /api/upstreams` |
| `POST /api/model-configs` | `POST /api/upstreams` |
| `PUT /api/model-configs/[id]` | `PUT /api/upstreams/[id]` |
| `DELETE /api/model-configs/[id]` | `DELETE /api/upstreams/[id]` |
| `GET /api/model-configs/[id]/balance` | `GET /api/upstreams/[id]/balance` |

### 6. 前端 Composables

**app/composables/useUpstreams.ts**（原 useModelConfigs.ts）:
- 函数名：`useModelConfigs()` → `useUpstreams()`
- 返回类型包含关联的 aimodels

**新增 app/composables/useAimodels.ts**（可选）:
- 模型的 CRUD 操作

**其他 Composables 需更新**:
- `app/composables/useTasks.ts`
- `app/composables/useConversations.ts`
- `app/composables/useAssistants.ts`
- `app/composables/useChatModels.ts`

### 7. 前端页面

- `app/pages/settings/models/index.vue` - 列表页
- `app/pages/settings/models/[id].vue` - 编辑页（改为编辑上游+管理模型）
- `app/pages/chat.vue`
- `app/pages/drawing.vue`

### 8. 前端组件

- `app/components/ModelSelector.vue` - 模型选择器
- `app/components/drawing/Workbench.vue`
- `app/components/drawing/Card.vue`
- `app/components/chat/MessageInput.vue`
- `app/components/chat/AssistantEditor.vue`
- `app/components/settings/Sidebar.vue`（UI 文字）

### 9. 测试文件

- `tests/api-integration.test.ts`
- `tests/shared.test.ts`

### 10. 文档

- `CLAUDE.md`
- `README.md`
- `docs/` 目录下相关文档

## 实施步骤

### 第一阶段：数据库重构

1. 备份数据库
2. 更新 `server/database/schema.ts`：
   - 重命名表 `model_configs` → `upstreams`
   - 新建表 `aimodels`
   - 更新外键字段
3. 生成迁移文件：`pnpm db:generate`
4. 编写数据迁移脚本（JSON → 子表）
5. 执行迁移：`pnpm db:migrate`
6. 验证数据迁移正确

### 第二阶段：类型和服务层

7. 更新 `app/shared/types.ts`
8. 新建 `server/services/aimodel.ts`
9. 重命名并更新 `server/services/upstream.ts`
10. 更新所有引用的后端服务文件

### 第三阶段：API 路由

11. 重命名 `server/api/model-configs/` → `server/api/upstreams/`
12. 新增 aimodels 相关路由
13. 更新所有 API 文件

### 第四阶段：前端

14. 重命名并更新 `app/composables/useUpstreams.ts`
15. 新增 `app/composables/useAimodels.ts`（如需要）
16. 更新所有页面和组件
17. 更新 UI 显示文字

### 第五阶段：验证和文档

18. 运行类型检查：`pnpm typecheck`
19. 运行测试：`pnpm test`
20. 手动测试核心功能
21. 更新文档和注释
22. 删除临时文件

## 统计

| 类别 | 数量 |
|------|------|
| 文件重命名 | 3 |
| 数据库表重命名 | 1 |
| 数据库新建表 | 1 (aimodels) |
| 数据库字段变更 | ~6 |
| API 路由变更 | 5+ |
| 核心类型改名 | 2 (ModelConfig→Upstream, ModelTypeConfig→Aimodel) |
| 涉及文件总数 | ~55 |
| 预计修改点 | ~350+ |

## 风险控制

1. **数据库备份**：迁移前必须备份 `data/mj-studio.db`
2. **数据迁移验证**：JSON 数据迁移到子表后，验证数据完整性
3. **回滚方案**：Git 提交分阶段进行，保留数据库备份

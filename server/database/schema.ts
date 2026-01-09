import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'

// 从共享模块导入类型和常量
// 类型用于数据库字段定义，常量已移至 shared/constants.ts
export type {
  ModelCategory,
  ImageModelType,
  ChatModelType,
  VideoModelType,
  ModelType,
  ApiFormat,
  TaskType,
  TaskStatus,
  MessageRole,
  MessageMark,
  MessageStatus,
  MessageFile,
  ApiKeyConfig,
  UpstreamPlatform,
  UpstreamInfo,
} from '../../app/shared/types'

import type { ModelCategory, ModelType, ApiFormat, TaskType, TaskStatus, MessageRole, MessageMark, MessageStatus, MessageFile, ApiKeyConfig, UpstreamPlatform, UpstreamInfo, ModelParams } from '../../app/shared/types'

// 用户表
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // hashed
  name: text('name'),
  avatar: text('avatar'), // 头像 base64 或 URL
  mcpApiKey: text('mcp_api_key'), // MCP 接口 API Key，格式：mjs_xxx
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// 上游配置表（用户级别）- 原 model_configs
export const upstreams = sqliteTable('upstreams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(), // 上游名称，用户自定义，如 "我的MJ", "公司API"
  baseUrl: text('base_url').notNull(), // API请求前缀
  apiKey: text('api_key').notNull(), // API密钥（主Key）
  apiKeys: text('api_keys', { mode: 'json' }).$type<ApiKeyConfig[]>(), // 多Key配置
  remark: text('remark'), // 备注说明
  sortOrder: integer('sort_order').notNull().default(999), // 排序顺序，0 表示置顶
  upstreamPlatform: text('upstream_platform').$type<UpstreamPlatform>(), // 上游平台类型（用于余额查询）
  userApiKey: text('user_api_key'), // 用户在该平台的 Key（用于余额查询等）
  upstreamInfo: text('upstream_info', { mode: 'json' }).$type<UpstreamInfo>(), // 上游信息缓存（余额、用户信息等）
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // 软删除：null=正常，有值=已删除
})

export type Upstream = typeof upstreams.$inferSelect
export type NewUpstream = typeof upstreams.$inferInsert

// AI 模型表（上游的子表）- 原 model_type_configs JSON 字段
export const aimodels = sqliteTable('aimodels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  upstreamId: integer('upstream_id').notNull(), // 关联上游配置
  category: text('category').$type<ModelCategory>().notNull(), // 模型分类：image | chat
  modelType: text('model_type').$type<ModelType>().notNull(), // 界面显示的模型类型
  apiFormat: text('api_format').$type<ApiFormat>().notNull(), // 实际请求时使用的 API 格式
  modelName: text('model_name').notNull(), // 发送给上游的模型标识符
  name: text('name').notNull(), // 显示名称（用户可自定义）
  estimatedTime: integer('estimated_time').notNull().default(60), // 预计时间（秒）
  keyName: text('key_name').notNull().default('default'), // 使用的 Key 名称
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // 软删除：null=正常，有值=已删除
})

export type Aimodel = typeof aimodels.$inferSelect
export type NewAimodel = typeof aimodels.$inferInsert

// 任务表
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().default(1),
  upstreamId: integer('upstream_id').notNull(), // 关联上游配置
  aimodelId: integer('aimodel_id').notNull(), // 关联 AI 模型
  taskType: text('task_type').$type<TaskType>().notNull().default('image'), // 任务类型：image | video
  modelType: text('model_type').$type<ModelType>().notNull(), // 实际使用的模型类型（冗余，便于查询）
  apiFormat: text('api_format').$type<ApiFormat>().notNull(), // 使用的请求格式（冗余，便于查询）
  modelName: text('model_name').notNull(), // 实际使用的模型名称（冗余，便于查询）
  prompt: text('prompt'),
  modelParams: text('model_params', { mode: 'json' }).$type<ModelParams | null>(), // 模型专用参数（JSON）
  images: text('images', { mode: 'json' }).$type<string[]>().default([]),
  type: text('type').notNull().default('imagine'), // imagine | blend（图片任务专用）
  status: text('status').$type<TaskStatus>().notNull().default('pending'),
  upstreamTaskId: text('upstream_task_id'), // 上游返回的任务ID
  progress: text('progress'), // 进度，如 "50%"
  resourceUrl: text('resource_url'), // 产物 URL（图片或视频），本地化前为远程 URL，本地化后为服务器相对路径
  error: text('error'), // 错误信息
  isBlurred: integer('is_blurred', { mode: 'boolean' }).notNull().default(true), // 图片模糊状态（防窥屏）
  uniqueId: text('unique_id'), // 唯一标识（用于嵌入式绘图组件的去重和缓存）
  sourceType: text('source_type').$type<'workbench' | 'chat'>().default('workbench'), // 任务来源：workbench=绘图工作台，chat=对话嵌入
  buttons: text('buttons', { mode: 'json' }).$type<Array<{
    customId: string
    emoji: string
    label: string
    style: number
    type: number
  }>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp' }), // 任务开始执行时间
  duration: integer('duration'), // 实际耗时（秒）
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // 软删除：null=正常，有值=已删除
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

// ==================== 对话功能相关表 ====================

// 助手表
export const assistants = sqliteTable('assistants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  avatar: text('avatar'), // 头像图片路径
  systemPrompt: text('system_prompt'),
  aimodelId: integer('aimodel_id'), // 关联 AI 模型（通过此字段可获取 upstream 信息）
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  suggestions: text('suggestions', { mode: 'json' }).$type<string[]>(), // 开场白建议缓存
  conversationCount: integer('conversation_count').notNull().default(0), // 对话数量（冗余字段，由后端维护）
  enableThinking: integer('enable_thinking', { mode: 'boolean' }).notNull().default(false), // 是否启用思考功能
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Assistant = typeof assistants.$inferSelect
export type NewAssistant = typeof assistants.$inferInsert

// 对话表
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  assistantId: integer('assistant_id').notNull(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert

// 消息表
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull(),
  role: text('role').$type<MessageRole>().notNull(),
  content: text('content').notNull(),
  files: text('files', { mode: 'json' }).$type<MessageFile[]>(), // 附件文件列表
  modelDisplayName: text('model_display_name'), // 模型显示名称（格式："上游名称 / 模型显示名称"），仅 assistant 消息，历史快照用于显示
  mark: text('mark').$type<MessageMark>(), // 消息标记：error=错误，compress-request=压缩请求，compress-response=压缩响应
  status: text('status').$type<MessageStatus>(), // AI 消息状态：created/pending/streaming/completed/stopped/failed
  sortId: integer('sort_id'), // 排序ID，用于压缩后消息重排序
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

// ==================== 用户设置表 ====================

// 用户设置表（键值对形式）
export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  unique().on(table.userId, table.key),
])

export type UserSetting = typeof userSettings.$inferSelect
export type NewUserSetting = typeof userSettings.$inferInsert

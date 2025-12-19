import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// 从共享模块导入类型和常量
// 类型用于数据库字段定义，常量已移至 shared/constants.ts
export type {
  ModelCategory,
  ImageModelType,
  ChatModelType,
  ModelType,
  ApiFormat,
  TaskStatus,
  MessageRole,
  MessageMark,
  MessageStatus,
  ModelTypeConfig,
} from '../../app/shared/types'

import type { ModelType, ApiFormat, ModelTypeConfig, TaskStatus, MessageRole, MessageMark, MessageStatus } from '../../app/shared/types'

// 用户表
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // hashed
  name: text('name'),
  avatar: text('avatar'), // 头像 base64 或 URL
  blurByDefault: integer('blur_by_default', { mode: 'boolean' }).notNull().default(true), // 绘图结果默认模糊
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// 模型配置表（用户级别）
export const modelConfigs = sqliteTable('model_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(), // 上游名称，用户自定义，如 "我的MJ", "公司API"
  baseUrl: text('base_url').notNull(), // API请求前缀
  apiKey: text('api_key').notNull(), // API密钥
  modelTypeConfigs: text('model_type_configs', { mode: 'json' }).$type<ModelTypeConfig[]>().notNull(), // 模型类型配置数组
  remark: text('remark'), // 备注说明
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false), // 是否默认
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type ModelConfig = typeof modelConfigs.$inferSelect
export type NewModelConfig = typeof modelConfigs.$inferInsert

// 任务表（TaskStatus 类型已从 shared/types 导入）
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().default(1),
  modelConfigId: integer('model_config_id').notNull(), // 关联模型配置
  modelType: text('model_type').$type<ModelType>().notNull(), // 实际使用的模型类型
  apiFormat: text('api_format').$type<ApiFormat>().notNull(), // 使用的请求格式
  modelName: text('model_name'), // 实际使用的模型名称
  prompt: text('prompt'),
  images: text('images', { mode: 'json' }).$type<string[]>().default([]),
  type: text('type').notNull().default('imagine'), // imagine | blend
  status: text('status').$type<TaskStatus>().notNull().default('pending'),
  upstreamTaskId: text('upstream_task_id'), // 上游返回的任务ID
  progress: text('progress'), // 进度，如 "50%"
  imageUrl: text('image_url'), // 生成的图片URL
  error: text('error'), // 错误信息
  isBlurred: integer('is_blurred', { mode: 'boolean' }).notNull().default(true), // 图片模糊状态（防窥屏）
  buttons: text('buttons', { mode: 'json' }).$type<Array<{
    customId: string
    emoji: string
    label: string
    style: number
    type: number
  }>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // 软删除：null=正常，有值=已删除
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

// ==================== 对话功能相关表 ====================
// MessageRole 类型已从 shared/types 导入

// 助手表
export const assistants = sqliteTable('assistants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  avatar: text('avatar'), // 头像图片路径
  systemPrompt: text('system_prompt'),
  modelConfigId: integer('model_config_id'), // 当前使用的上游ID
  modelName: text('model_name'), // 当前使用的模型名
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
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
  modelConfigId: integer('model_config_id'), // 使用的上游ID，仅assistant消息
  modelName: text('model_name'), // 使用的模型名，仅assistant消息
  mark: text('mark').$type<MessageMark>(), // 消息标记：error=错误，compress-request=压缩请求，compress-response=压缩响应
  status: text('status').$type<MessageStatus>(), // AI 消息状态：created/pending/streaming/completed/stopped/failed
  sortId: integer('sort_id'), // 排序ID，用于压缩后消息重排序
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

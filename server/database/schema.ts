import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// 用户表
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // hashed
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// 支持的模型类型
export type ModelType = 'midjourney' | 'gemini' | 'flux' | 'dalle' | 'doubao' | 'gpt4o-image' | 'grok-image' | 'qwen-image'

// 支持的请求格式
export type ApiFormat = 'mj-proxy' | 'gemini' | 'dalle' | 'openai-chat'

// 模型类型配置
export interface ModelTypeConfig {
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string        // 实际请求时使用的模型名称
  estimatedTime: number    // 预计生成时间（秒）
}

// 模型类型与请求格式的对应关系
export const MODEL_FORMAT_MAP: Record<ModelType, ApiFormat[]> = {
  'midjourney': ['mj-proxy'],
  'gemini': ['gemini', 'openai-chat'],
  'flux': ['dalle'],
  'dalle': ['dalle'],
  'doubao': ['dalle'],
  'gpt4o-image': ['openai-chat'],
  'grok-image': ['openai-chat'],
  'qwen-image': ['openai-chat'],
}

// 默认模型名称
export const DEFAULT_MODEL_NAMES: Record<ModelType, string> = {
  'midjourney': '',
  'gemini': 'gemini-2.5-flash-image',
  'flux': 'flux-dev',
  'dalle': 'dall-e-3',
  'doubao': 'doubao-seedream-3-0-t2i-250415',
  'gpt4o-image': 'gpt-4o-image',
  'grok-image': 'grok-4',
  'qwen-image': 'qwen-image',
}

// 默认预计时间（秒）
export const DEFAULT_ESTIMATED_TIMES: Record<ModelType, number> = {
  'midjourney': 60,
  'gemini': 15,
  'flux': 20,
  'dalle': 15,
  'doubao': 15,
  'gpt4o-image': 30,
  'grok-image': 30,
  'qwen-image': 30,
}

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

// 任务状态
export type TaskStatus = 'pending' | 'submitting' | 'processing' | 'success' | 'failed'

// 任务表
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

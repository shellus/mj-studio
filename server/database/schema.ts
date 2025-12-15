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
export type ModelType = 'midjourney' | 'gemini'

// 模型配置表（用户级别）
export const modelConfigs = sqliteTable('model_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(), // 上游名称，用户自定义，如 "我的MJ", "公司API"
  types: text('types', { mode: 'json' }).$type<ModelType[]>().notNull(), // 支持的模型类型数组
  baseUrl: text('base_url').notNull(), // API请求前缀
  apiKey: text('api_key').notNull(), // API密钥
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
  prompt: text('prompt'),
  images: text('images', { mode: 'json' }).$type<string[]>().default([]),
  type: text('type').notNull().default('imagine'), // imagine | blend
  status: text('status').$type<TaskStatus>().notNull().default('pending'),
  upstreamTaskId: text('upstream_task_id'), // 上游返回的任务ID
  progress: text('progress'), // 进度，如 "50%"
  imageUrl: text('image_url'), // 生成的图片URL
  error: text('error'), // 错误信息
  buttons: text('buttons', { mode: 'json' }).$type<Array<{
    customId: string
    emoji: string
    label: string
    style: number
    type: number
  }>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

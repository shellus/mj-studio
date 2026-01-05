-- Custom SQL migration file, put your code below! --

-- 为 aimodels 表添加 name 字段（显示名称）
-- 策略：由于 SQLite 不支持修改列约束，使用表重建方式

-- 步骤 1: 添加临时列
ALTER TABLE aimodels ADD COLUMN name_temp TEXT;
--> statement-breakpoint
-- 步骤 2: 按规则填充数据
-- 对话模型: name = modelName
UPDATE aimodels SET name_temp = model_name WHERE category = 'chat';
--> statement-breakpoint
-- 绘图模型: name = MODEL_TYPE_LABELS[modelType]
UPDATE aimodels SET name_temp = 'Midjourney' WHERE category = 'image' AND model_type = 'midjourney';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Gemini 绘图' WHERE category = 'image' AND model_type = 'gemini';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Flux' WHERE category = 'image' AND model_type = 'flux';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'DALL-E' WHERE category = 'image' AND model_type = 'dalle';
--> statement-breakpoint
UPDATE aimodels SET name_temp = '豆包绘图' WHERE category = 'image' AND model_type = 'doubao';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'GPT-4o 绘图' WHERE category = 'image' AND model_type = 'gpt4o-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'GPT Image' WHERE category = 'image' AND model_type = 'gpt-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Sora 绘图' WHERE category = 'image' AND model_type = 'sora-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Grok 绘图' WHERE category = 'image' AND model_type = 'grok-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = '通义万相' WHERE category = 'image' AND model_type = 'qwen-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Z-Image' WHERE category = 'image' AND model_type = 'z-image';
--> statement-breakpoint
UPDATE aimodels SET name_temp = '抠抠图' WHERE category = 'image' AND model_type = 'koukoutu';
--> statement-breakpoint
-- 视频模型: name = MODEL_TYPE_LABELS[modelType]
UPDATE aimodels SET name_temp = '即梦视频' WHERE category = 'video' AND model_type = 'jimeng-video';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Veo' WHERE category = 'video' AND model_type = 'veo';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Sora' WHERE category = 'video' AND model_type = 'sora';
--> statement-breakpoint
UPDATE aimodels SET name_temp = 'Grok 视频' WHERE category = 'video' AND model_type = 'grok-video';
--> statement-breakpoint
-- 步骤 3: 重建表以添加 NOT NULL 约束
CREATE TABLE aimodels_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upstream_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  model_type TEXT NOT NULL,
  api_format TEXT NOT NULL,
  model_name TEXT NOT NULL,
  name TEXT NOT NULL,
  estimated_time INTEGER NOT NULL DEFAULT 60,
  key_name TEXT NOT NULL DEFAULT 'default',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
-- 步骤 4: 复制数据（name_temp → name）
INSERT INTO aimodels_new (id, upstream_id, category, model_type, api_format, model_name, name, estimated_time, key_name, created_at, deleted_at)
SELECT id, upstream_id, category, model_type, api_format, model_name, name_temp, estimated_time, key_name, created_at, deleted_at
FROM aimodels;
--> statement-breakpoint
-- 步骤 5: 删除旧表并重命名
DROP TABLE aimodels;
--> statement-breakpoint
ALTER TABLE aimodels_new RENAME TO aimodels;

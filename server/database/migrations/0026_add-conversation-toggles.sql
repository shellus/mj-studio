-- 为 conversations 表添加思考和搜索开关字段
ALTER TABLE conversations ADD COLUMN enable_thinking INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE conversations ADD COLUMN enable_web_search INTEGER NOT NULL DEFAULT 0;

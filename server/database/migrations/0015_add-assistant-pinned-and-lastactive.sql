-- 添加助手收藏和最后活跃时间字段
ALTER TABLE assistants ADD COLUMN pinned_at INTEGER;
--> statement-breakpoint
ALTER TABLE assistants ADD COLUMN last_active_at INTEGER;
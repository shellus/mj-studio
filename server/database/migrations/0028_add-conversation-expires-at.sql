-- 添加临时对话过期时间字段
ALTER TABLE conversations ADD COLUMN expires_at INTEGER;
--> statement-breakpoint

-- 添加索引以优化清理任务查询
CREATE INDEX idx_conversations_expires_at ON conversations(expires_at) WHERE expires_at IS NOT NULL;

-- 添加 tool_calls 字段到 messages 表
-- 工具调用记录现在存储在 assistant 消息中，而不是独立的 tool 消息

ALTER TABLE messages ADD COLUMN tool_calls TEXT;

--> statement-breakpoint

-- 删除所有 role='tool' 的消息（不再需要）
DELETE FROM messages WHERE role = 'tool';

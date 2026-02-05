-- 移除 assistants 表的 enable_thinking 字段（已迁移到 conversations 表）
ALTER TABLE assistants DROP COLUMN enable_thinking;

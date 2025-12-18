-- 添加消息标记字段
-- mark: 'error' = 错误消息, 'summary' = 压缩摘要消息
ALTER TABLE `messages` ADD COLUMN `mark` text;

-- 迁移旧的 is_error 数据（如果存在）
-- UPDATE `messages` SET `mark` = 'error' WHERE `is_error` = 1;

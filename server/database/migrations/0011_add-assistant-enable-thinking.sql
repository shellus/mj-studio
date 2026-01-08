-- 为 assistants 表添加 enable_thinking 字段
ALTER TABLE `assistants` ADD `enable_thinking` integer DEFAULT 0 NOT NULL;

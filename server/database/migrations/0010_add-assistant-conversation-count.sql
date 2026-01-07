-- 添加 conversation_count 列（冗余字段，由后端维护）
ALTER TABLE `assistants` ADD `conversation_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- 根据 conversations 表统计并更新现有助手的对话数量
UPDATE `assistants` SET `conversation_count` = (
  SELECT COUNT(*) FROM `conversations` WHERE `conversations`.`assistant_id` = `assistants`.`id`
);

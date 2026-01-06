-- Custom SQL migration file, put your code below! --

-- 1. 移除 assistants 表的冗余字段
ALTER TABLE `assistants` DROP COLUMN `upstream_id`;
--> statement-breakpoint
ALTER TABLE `assistants` DROP COLUMN `model_name`;
--> statement-breakpoint

-- 2. 移除 messages 表的 ID 关联字段
ALTER TABLE `messages` DROP COLUMN `upstream_id`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `aimodel_id`;
--> statement-breakpoint

-- 3. 重命名 messages.model_name -> model_display_name
ALTER TABLE `messages` RENAME COLUMN `model_name` TO `model_display_name`;
--> statement-breakpoint

-- 4. 为 upstreams 表添加软删除字段
ALTER TABLE `upstreams` ADD COLUMN `deleted_at` integer;

-- 将 is_default 布尔字段替换为 sort_order 整数字段
-- is_default=true -> sort_order=0（置顶）
-- is_default=false -> sort_order=999（默认）

-- 1. 添加 sort_order 列
ALTER TABLE `upstreams` ADD `sort_order` integer DEFAULT 999 NOT NULL;--> statement-breakpoint

-- 2. 迁移数据：is_default=1 的设为 0
UPDATE `upstreams` SET `sort_order` = 0 WHERE `is_default` = 1;--> statement-breakpoint

-- 3. 删除 is_default 列
ALTER TABLE `upstreams` DROP COLUMN `is_default`;

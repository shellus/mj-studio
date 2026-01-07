-- 添加任务开始执行时间和实际耗时字段
ALTER TABLE `tasks` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `duration` integer;--> statement-breakpoint
-- 历史数据填充：started_at = created_at
UPDATE `tasks` SET `started_at` = `created_at` WHERE `started_at` IS NULL;--> statement-breakpoint
-- 历史数据填充：duration = updated_at - created_at（已完成的任务）
UPDATE `tasks` SET `duration` = `updated_at` - `created_at` WHERE `status` IN ('success', 'failed') AND `duration` IS NULL;

ALTER TABLE `tasks` ADD `unique_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_type` text DEFAULT 'workbench';--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_unique_id_unique` ON `tasks` (`unique_id`) WHERE `unique_id` IS NOT NULL;
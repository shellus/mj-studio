ALTER TABLE `tasks` ADD `task_type` text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `resource_url` text;--> statement-breakpoint
UPDATE `tasks` SET `resource_url` = `image_url` WHERE `image_url` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `task_video` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`aspect_ratio` text,
	`size` text,
	`enhance_prompt` integer,
	`enable_upsample` integer,
	`image_mode` text,
	`enhanced_prompt` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `task_video_task_id_unique` ON `task_video` (`task_id`);--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `image_url`;

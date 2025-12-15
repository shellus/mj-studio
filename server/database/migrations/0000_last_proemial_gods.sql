CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`prompt` text,
	`images` text DEFAULT '[]',
	`type` text DEFAULT 'imagine' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`mj_task_id` text,
	`progress` text,
	`image_url` text,
	`error` text,
	`buttons` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

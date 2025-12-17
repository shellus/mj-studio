-- 助手表
CREATE TABLE `assistants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`avatar` text,
	`system_prompt` text,
	`model_config_id` integer,
	`model_name` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);

-- 对话表
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`assistant_id` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

-- 消息表
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model_config_id` integer,
	`model_name` text,
	`created_at` integer NOT NULL
);

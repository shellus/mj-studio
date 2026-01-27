-- Custom SQL migration file, put your code below! --
ALTER TABLE `assistants` ADD `auto_approve_mcp` integer DEFAULT 0 NOT NULL;

--> statement-breakpoint

ALTER TABLE `conversations` ADD `auto_approve_mcp` integer DEFAULT 0 NOT NULL;
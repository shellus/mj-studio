-- 删除工作流相关表（按依赖顺序删除）
DROP TABLE IF EXISTS `workflow_run_nodes`;--> statement-breakpoint
DROP TABLE IF EXISTS `workflow_runs`;--> statement-breakpoint
DROP TABLE IF EXISTS `workflows`;--> statement-breakpoint
DROP TABLE IF EXISTS `workflow_templates`;

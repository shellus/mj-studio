-- Custom SQL migration file, put your code below! --
-- 为 upstreams 表添加 disabled 字段，用于禁用上游
ALTER TABLE `upstreams` ADD `disabled` integer NOT NULL DEFAULT 0;

-- Custom SQL migration file, put your code below! --
-- 为 aimodels 表添加 sortOrder 字段，与 upstreams 表保持一致
ALTER TABLE `aimodels` ADD `sort_order` integer NOT NULL DEFAULT 999;

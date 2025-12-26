-- 为 aimodels 表添加软删除字段

ALTER TABLE `aimodels` ADD `deleted_at` integer;

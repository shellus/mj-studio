-- 添加消息排序字段
-- sortId: 用于压缩后消息重排序，普通消息 sortId = id
ALTER TABLE `messages` ADD COLUMN `sort_id` integer;

-- 初始化现有消息的 sortId 为 id
UPDATE `messages` SET `sort_id` = `id` WHERE `sort_id` IS NULL;

-- 移除 upstreams 表的 api_key 字段
-- 该字段已被 api_keys JSON 数组替代
ALTER TABLE `upstreams` DROP COLUMN `api_key`;

-- 添加消息状态字段
-- status: 用于追踪 AI 消息的生成状态
-- 状态值: created（已创建）, pending（等待响应）, streaming（正在接收）, completed（完成）, stopped（中断）, failed（失败）
ALTER TABLE `messages` ADD COLUMN `status` text;

-- 将现有的 AI 消息（role = 'assistant'）设置为 completed 状态
-- 用户消息（role = 'user'）保持 null
UPDATE `messages` SET `status` = 'completed' WHERE `role` = 'assistant' AND `status` IS NULL;

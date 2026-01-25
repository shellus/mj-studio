-- Custom SQL migration file, put your code below! --
-- 移除 messages 表的 tool_call_data 字段
-- 工具调用数据现在存储在 tool 消息的 content 字段中（JSON.stringify(ToolCallRecord[])）
ALTER TABLE messages DROP COLUMN tool_call_data;

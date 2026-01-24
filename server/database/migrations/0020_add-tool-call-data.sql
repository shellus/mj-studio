-- Custom SQL migration file, put your code below! --
ALTER TABLE messages ADD COLUMN tool_call_data TEXT;

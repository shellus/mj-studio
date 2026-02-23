-- 创建代理配置表
CREATE TABLE proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint

-- 上游配置关联代理
ALTER TABLE upstreams ADD COLUMN proxy_id INTEGER;

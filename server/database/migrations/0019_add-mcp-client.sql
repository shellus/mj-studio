-- MCP 服务配置表（用户级）
CREATE TABLE mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('sse', 'streamableHttp', 'stdio')),
  is_active INTEGER NOT NULL DEFAULT 1,
  base_url TEXT,
  headers TEXT,
  command TEXT,
  args TEXT,
  env TEXT,
  timeout INTEGER NOT NULL DEFAULT 60,
  disabled_tools TEXT NOT NULL DEFAULT '[]',
  auto_approve_tools TEXT NOT NULL DEFAULT '[]',
  logo_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

--> statement-breakpoint

CREATE INDEX idx_mcp_servers_user_id ON mcp_servers(user_id);

--> statement-breakpoint

-- 助手与 MCP 服务关联表
CREATE TABLE assistant_mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assistant_id INTEGER NOT NULL,
  mcp_server_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
  FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  UNIQUE(assistant_id, mcp_server_id)
);

--> statement-breakpoint

CREATE INDEX idx_assistant_mcp_servers_assistant_id ON assistant_mcp_servers(assistant_id);

--> statement-breakpoint

-- 助手表添加 maxToolSteps 字段
ALTER TABLE assistants ADD COLUMN max_tool_steps INTEGER NOT NULL DEFAULT 20;

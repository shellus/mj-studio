-- Custom SQL migration file, put your code below! --

-- 模型可用性测试记录表
CREATE TABLE model_test_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL DEFAULT 'chat',
  prompt TEXT NOT NULL,
  keywords TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

--> statement-breakpoint

-- 模型测试结果表
CREATE TABLE model_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL REFERENCES model_test_records(id) ON DELETE CASCADE,
  aimodel_id INTEGER NOT NULL REFERENCES aimodels(id),
  status TEXT NOT NULL DEFAULT 'pending',
  response_time INTEGER,
  response_preview TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

--> statement-breakpoint

CREATE INDEX idx_model_test_records_user_id ON model_test_records(user_id);

--> statement-breakpoint

CREATE INDEX idx_model_test_results_record_id ON model_test_results(record_id);
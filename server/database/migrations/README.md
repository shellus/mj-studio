# 数据库迁移规则 (Database Migration Rules)

## ⚠️ 重要警告 (WARNING)

1. **禁止使用 `pnpm db:generate` (drizzle-kit generate)**。
   本项目**只允许**使用自定义迁移（Custom Migrations）来精确控制 SQLite 的 Schema 变更。

2. **禁止手动创建 .sql 文件**。
   Drizzle 依赖 `meta/_journal.json` 来管理迁移顺序和断点。手动创建文件会导致索引丢失，迁移无法被识别或执行，破坏数据库一致性。**必须**通过 CLI 命令生成文件。

## 正确的开发流程

1. **创建迁移文件**：
   必须使用 `--custom` 参数：
   ```bash
   pnpm drizzle-kit generate --custom --name=your_migration_name
   ```

2. **编写 SQL**：
   在生成的 `.sql` 文件中编写 DDL 语句。

3. **多语句分隔**：
   如果你在一个文件中包含多条 SQL 语句，**必须**使用 `--> statement-breakpoint` 分隔：

   ```sql
   ALTER TABLE foo ADD COLUMN bar TEXT;

   --> statement-breakpoint

   CREATE TABLE baz (id INTEGER PRIMARY KEY);
   ```

## 参考文档

详细规则请参阅项目根目录的 `CLAUDE.md`。
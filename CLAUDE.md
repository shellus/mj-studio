# CLAUDE.md

本文件为 Claude Code 提供项目特定的工作指引。

**文件定位**：只记录本项目中容易踩坑的规则和约定，避免重复犯错。

**不应包含**：框架基础知识、通用最佳实践、可从官方文档查到的标准配置、大块示例代码（如有必要，引用文件/行数/函数名）

**应当包含**：项目特有的架构决策、曾经踩过的坑、与常规做法不同的特殊处理

---

## 项目概述

多模型 AI 工作台（绘图/视频/对话）。技术栈：Nuxt 4 + Drizzle ORM + SQLite。

详细文档见 `docs/` 目录，修改相关功能前应先查阅。

---

## 注意事项

### 环境变量

**禁止在 nuxt.config.ts 中使用 `process.env.XXX`**（构建时读取，Docker 镜像无法运行时配置）。

正确做法：`runtimeConfig` + `NUXT_` 前缀。添加新变量需同步三处：
1. `nuxt.config.ts` 的 `runtimeConfig`
2. `.env`
3. `docker-compose.yaml` 的 `environment`

### 数据库迁移

**禁止使用 `pnpm db:generate`**，因为它需要交互式选择字段变化类型，我们只用自定义迁移：
```bash
pnpm drizzle-kit generate --custom --name=my-migration
```

多语句用 `--> statement-breakpoint` 分隔。SQLite 支持 `DROP COLUMN`。

### TypeScript 常见问题

- `array[index]` 返回 `T | undefined`，使用前必须检查
- `catch (err)` 中 err 是 unknown，需断言后访问属性
- SSE/JSON 传输时 `Date` 需转 ISO 字符串

---

## 架构约定

### 前后端共享类型

`app/shared/` 目录存放前后端共用的类型和常量。添加新模型类型需同步更新 `types.ts` 和 `constants.ts`。

### 资源处理

- 前端提交：本地 URL（`/api/images/xxx`），不直接提交 Base64
- 数据库存储：`resourceUrl` 存本地 URL
- 上游请求：后端按需转 Base64
- 结果本地化：上游返回的资源必须保存到本地

### 全局事件系统

事件驱动模式实现多端同步。事件处理器在插件中注册（`app/plugins/global-events.client.ts`），Composable 只提供状态和方法。

> 详见 [docs/features/多端同步和流式输出.md](docs/features/多端同步和流式输出.md)

### UI 规范

Nuxt UI 4 + Fluent 2 风格。详见 [docs/dev-spec/设计系统.md](docs/dev-spec/设计系统.md)。

### 测试规则

在完成主要功能或修复 bug 后，**提交代码前**必须运行单元测试：

```bash
pnpm test
```

新功能开发应尽量包含对应的单元测试或集成测试。
测试文件规范：
- 单元测试放在 `__tests__` 目录下
- 集成测试放在 `tests/integration` 目录下
- 测试必须通过 `vitest` 运行

### Git Worktree 规则

**Worktree 目录**：`.worktrees/`（已在 .gitignore 中）

**创建 worktree 后的设置**：
1. 复制 `.env` 文件
2. 软链接 `node_modules/` 和 `data/`（避免重复安装依赖和复制数据）
3. 运行 `nuxt prepare` 生成 `.nuxt` 目录（否则测试会失败）

**命令示例**：
```bash
# 创建 worktree
git worktree add .worktrees/<branch-name> -b feature/<branch-name>

# 设置环境
cp .env .worktrees/<branch-name>/.env
ln -s $(pwd)/node_modules .worktrees/<branch-name>/node_modules
ln -s $(pwd)/data .worktrees/<branch-name>/data

# 生成 Nuxt 类型（必须，否则测试失败）
cd .worktrees/<branch-name> && pnpm nuxt prepare
```

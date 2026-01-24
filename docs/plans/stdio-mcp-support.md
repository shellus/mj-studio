# stdio MCP 支持实现计划

## 目标

为 MCP 客户端添加 stdio 传输类型支持，允许通过本地进程（如 npx、node、python）调用 MCP 服务。

## 前置条件

- [x] 数据库字段已预留：`command`, `args`, `env`
- [x] 类型定义已包含：`McpServerType = 'sse' | 'streamableHttp' | 'stdio'`
- [x] MCP SDK 已提供：`StdioClientTransport`

## 实现任务

### 1. 后端：传输层支持

**文件**: `server/services/mcpClient/transports.ts`

- [x] 导入 `StdioClientTransport`
- [x] 在 `createTransport` 函数中添加 stdio 分支
- [x] 合并环境变量（process.env + server.env）
- [x] 配置 stderr 捕获

### 2. 后端：类型扩展

**文件**: `server/services/mcpClient/types.ts`

- [x] 扩展 `McpTransport` 类型包含 `StdioClientTransport`

### 3. 前端：表单支持

**文件**: `app/components/mcp/ServerEditModal.vue`

- [x] 添加类型选择（HTTP / stdio）
- [x] stdio 模式显示：命令、参数、环境变量字段
- [x] HTTP 模式显示：URL、Headers 字段
- [x] JSON 导入支持 stdio 格式

### 4. 前端：类型定义

**文件**: `app/shared/types.ts`

- [x] 扩展 `McpServerDisplay` 包含 stdio 字段

### 5. 文档更新

- [x] `docs/dev-spec/mcp-client-design.md` - 添加 stdio 传输说明
- [x] `docs/features/MCP客户端功能介绍.md` - 更新支持状态

## 技术细节

### StdioClientTransport 参数

```typescript
interface StdioServerParameters {
  command: string           // 可执行命令
  args?: string[]           // 命令行参数
  env?: Record<string, string>  // 环境变量
  stderr?: IOType | Stream  // stderr 处理方式
  cwd?: string              // 工作目录
}
```

### 环境变量合并策略

```typescript
env: {
  ...process.env,    // 继承当前进程环境
  ...server.env,     // 覆盖自定义变量
}
```

### JSON 导入格式支持

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/dir"]
    }
  }
}
```

## 测试验证

- [ ] 创建 stdio 类型服务
- [ ] 测试连接
- [ ] 获取工具列表
- [ ] 执行工具调用

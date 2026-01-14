# 流式 Markdown 分块渲染方案

## 背景问题

当前流式输出存在两个主要问题：

1. **性能问题**：每次内容追加都完整重新渲染整个 Markdown，长消息时性能开销大
2. **无法复制文字**：DOM 不断被替换，用户选中的文字会丢失

## 解决方案

采用 **分块渲染（Block-based Rendering）** 策略，参考 LobeChat 的实现。

### 核心思路

```
完整内容 → marked.lexer() 分词 → 独立 Block 组件 → 缓存已完成块
```

1. 使用 `marked.lexer()` 将 Markdown 解析为 tokens（段落、标题、代码块等）
2. 每个 token 作为独立块渲染
3. 已完成的块缓存 HTML，不再重新渲染
4. 只有最后一个块（正在输出中）实时更新

### 效果

- 10 个段落输出完，正在输出第 11 个 → **只有第 11 个段落触发渲染**
- 前 10 个段落 DOM 完全不变，**可以正常复制**

## 实现架构

### 组件结构

```
StreamMarkdown.vue
├── marked.lexer() 分词
├── 遍历 tokens
│   ├── 已完成块：从缓存读取 HTML
│   └── 进行中块：实时渲染
└── v-for 渲染各块
```

### 关键代码

```typescript
// 将 Markdown 分词
const tokens = computed(() => {
  if (!props.content) return []
  return marked.lexer(props.content)
})

// 监听 tokens 变化，增量更新
watch(tokens, async (newTokens) => {
  for (let i = 0; i < newTokens.length; i++) {
    const token = newTokens[i]
    const isLast = i === newTokens.length - 1
    const isComplete = !props.isStreaming || !isLast

    // 已完成块：复用缓存
    if (existingBlock?.isComplete && blockCache.has(cacheKey)) {
      // 跳过渲染，使用缓存
    } else {
      // 渲染并缓存
      const html = await renderToken(token)
      if (isComplete) blockCache.set(cacheKey, html)
    }
  }
})
```

### Token 类型处理

| Token 类型 | 说明 | 是否完整块 |
|-----------|------|----------|
| `heading` | 标题 | ✅ |
| `paragraph` | 段落 | ✅ |
| `code` | 代码块 | ✅ |
| `list` | 列表 | ✅ |
| `blockquote` | 引用 | ✅ |
| `table` | 表格 | ✅ |
| `hr` | 分隔线 | ✅ |

`marked.lexer()` 会正确识别块级元素，不会拆散相关联的内容（如多行代码块、表格行等）。

## 与现有方案对比

| 维度 | 现有方案（全量渲染） | 分块渲染方案 |
|------|-------------------|-------------|
| 渲染范围 | 整个消息 | 仅变化的块 |
| 性能 | O(n) 每次更新 | O(1) 增量更新 |
| 复制文字 | ❌ 不可用 | ✅ 可用 |
| 实现复杂度 | 低 | 中 |
| 代码高亮 | 每次重算 | 缓存复用 |

## 概念验证

测试页面：`/test/stream-markdown`

### 测试结果
- ✅ 已完成块被跳过渲染（渲染统计可见）
- ✅ 流式输出时可选中复制文字
- ✅ 代码块语法高亮正常
- ✅ 表格、列表等复杂结构正常

## 后续工作

将此方案应用到实际对话页面需要：

1. **完善 StreamMarkdown 组件**
   - 支持 `<think>` 思考块折叠
   - 支持 `mj-drawing` 绘图组件
   - 完善行内 Markdown 渲染（加粗、斜体、链接等）

2. **替换现有渲染逻辑**
   - 替换 `MessageList.vue` 中的 `MarkdownContent`
   - 移除 150ms 定时器全量渲染机制

3. **测试边界情况**
   - 超长消息性能
   - 复杂嵌套结构
   - 代码块中途中断
   - 思考过程流式显示

## 参考资料

- LobeChat 流式渲染实现：使用 `@lobehub/ui` 的 `StreamdownRender` 组件
- marked 官方文档：[Lexer API](https://marked.js.org/using_pro#lexer)

## 文件位置

- 分块渲染组件：`app/components/test/StreamMarkdown.vue`
- 测试页面：`app/pages/test/stream-markdown.vue`

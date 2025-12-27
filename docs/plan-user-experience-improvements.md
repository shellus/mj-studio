# 用户体验改进开发计划

本文档描述一系列用户体验改进需求的实现方案。

---

## 1. 删除助手确认框样式统一

### 需求
删除助手的确认框多了一个关闭按钮（右上角 X），需要和删除对话的确认框保持一致（只有确认和取消按钮）。

### 当前实现对比
- `app/components/chat/ConversationList.vue`（删除对话）：
  ```vue
  <UModal v-model:open="showDeleteConfirm" title="确认删除" :close="false">
  ```
  使用 `:close="false"` 隐藏了关闭按钮 ✅

- `app/components/chat/AssistantEditor.vue`（删除助手）：
  ```vue
  <UModal :open="deleteConfirmOpen" title="确认删除" @update:open="...">
  ```
  没有 `:close="false"`，所以有关闭按钮 ❌

### 修改方案
在 `AssistantEditor.vue` 的删除确认弹窗添加 `:close="false"` 属性：
```vue
<UModal
  :open="deleteConfirmOpen"
  title="确认删除"
  :close="false"
  @update:open="deleteConfirmOpen = $event"
>
```

### 涉及文件
- `app/components/chat/AssistantEditor.vue`

---

## 2. 消息气泡显示模型和大小

### 需求
在每个对话气泡下方的下拉菜单中，添加该消息使用的模型名称和消息大小。

### 当前实现
- 文件：`app/components/chat/MessageList.vue`
- 消息元信息区域已显示 `message.modelName`（仅 assistant 消息）
- 下拉菜单包含：复制、分叉对话、删除此消息及以上

### 修改方案
1. 在下拉菜单顶部添加 **disabled 信息项**（不可点击，仅展示）：
   - 模型名称（如果有）
   - 消息大小（计算公式参考 `MessageInput.vue` 的 `conversationStats`）

2. 消息大小计算：
   ```typescript
   function getMessageSize(message: Message): number {
     let size = new TextEncoder().encode(message.content).length
     if (message.files?.length) {
       for (const file of message.files) {
         if (file.mimeType.startsWith('image/')) {
           size += Math.ceil(file.size * 4 / 3) // base64 编码
         }
       }
     }
     return size
   }
   ```

3. 格式化显示：
   ```typescript
   function formatSize(size: number): string {
     if (size < 1024) return `${size} B`
     if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
     return `${(size / 1024 / 1024).toFixed(1)} MB`
   }
   ```

### 涉及文件
- `app/components/chat/MessageList.vue`

---

## 3. 代码块深色模式适配

### 需求
消息气泡中的代码块没有遵循深色模式。

### 当前实现
- 文件：`app/composables/useMarkdown.ts`
- 使用 Shiki 高亮，配置了双主题：
  ```typescript
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  }
  ```

### 问题分析
Shiki 的双主题需要 CSS 变量配合切换。需要检查：
1. Shiki 输出的 HTML 是否包含深色模式类名
2. 是否需要添加 CSS 覆盖

### 修改方案
1. 检查 Shiki 输出，确认是否使用 `shiki-themes` 双主题模式
2. 如果是，添加 CSS 规则在 `.dark` 模式下切换主题变量
3. 或者改用 `transformerTwoslash` 等方式动态切换

### 涉及文件
- `app/composables/useMarkdown.ts`
- `app/assets/css/main.css`（如需添加样式）

---

## 4. 开场白缓存到数据库

### 需求
1. 取消 1 小时过期重新生成的逻辑
2. 从内存缓存改为缓存在助手的数据库字段

### 当前实现
- 前端：`app/composables/useConversationSuggestions.ts`
- 后端：`server/api/assistants/[id]/suggestions.post.ts`
- 使用 Nuxt `useState` 按助手 ID 缓存

### 修改方案

#### 4.1 数据库修改
在 `assistants` 表添加字段：
```typescript
suggestions: text('suggestions', { mode: 'json' }).$type<string[]>(),
```

#### 4.2 后端 API 修改
`server/api/assistants/[id]/suggestions.post.ts`:
1. 请求时检查数据库中是否已有 `suggestions`
2. 如果有且 `refresh=false`，直接返回缓存
3. 如果没有或 `refresh=true`，调用 AI 生成，保存到数据库后返回

#### 4.3 前端修改
`app/composables/useConversationSuggestions.ts`:
- 移除 1 小时过期逻辑（如果有）
- 简化为仅调用 API，由后端决定是否重新生成

### 涉及文件
- `server/database/schema.ts` - 添加字段
- `server/api/assistants/[id]/suggestions.post.ts` - 修改逻辑
- `app/composables/useConversationSuggestions.ts` - 简化逻辑
- 新增数据库迁移文件

---

## 5. 嵌入式绘图组件按钮优化

### 需求
1. 信息按钮从右下角移动到左上角与其他按钮一起
2. 所有按钮默认隐藏，PC 端鼠标悬浮显示，移动端点击图片显示

### 当前实现
- 文件：`app/components/chat/MjDrawingBlock.vue`
- 左上角：下载、放大、重新生成按钮
- 右下角：信息按钮
- 按钮始终显示

### 修改方案

#### 5.1 按钮布局
将信息按钮移动到左上角按钮组：
```vue
<div class="absolute top-2 left-2 flex gap-1">
  <!-- 下载、放大、重新生成、信息按钮 -->
</div>
```

#### 5.2 悬浮/点击显示逻辑
参考 `MessageList.vue` 的实现：

1. 添加状态：
   ```typescript
   const showActions = ref(false)
   ```

2. 图片容器添加事件：
   ```vue
   <div
     class="group relative"
     @click="toggleActions"
     @mouseenter="showActions = true"
     @mouseleave="showActions = false"
   >
   ```

3. 按钮组添加条件显示：
   ```vue
   <div
     v-if="status === 'success' && imageUrl"
     class="absolute top-2 left-2 flex gap-1 transition-opacity"
     :class="showActions ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'"
   >
   ```

4. 点击切换逻辑：
   ```typescript
   function toggleActions() {
     showActions.value = !showActions.value
   }
   ```

### 涉及文件
- `app/components/chat/MjDrawingBlock.vue`

---

## 6. 删除账号功能

### 需求
让用户可以删除自己的所有信息，需要确认密码。

### 数据库表关联分析

| 表 | userId 字段 | 删除方式 |
|---|---|---|
| users | 主键 | 直接删除 |
| upstreams | ✅ 直接关联 | WHERE userId = ? |
| aimodels | ❌ 间接关联 | 通过 upstreams 级联 |
| tasks | ✅ 直接关联 | WHERE userId = ? |
| assistants | ✅ 直接关联 | WHERE userId = ? |
| conversations | ✅ 直接关联 | WHERE userId = ? |
| messages | ❌ 间接关联 | 通过 conversations 级联 |
| userSettings | ✅ 直接关联 | WHERE userId = ? |

### 安全性分析
- `messages` 表：当前 API 已验证用户权限（通过 conversation 关联）
- `aimodels` 表：当前无独立 API，仅通过 upstreams 接口访问
- **建议**：虽然目前安全，但为防止将来添加新 API 时遗漏权限检查，可以考虑给这两个表添加 `userId` 冗余字段（本次不实现，记录为后续优化）

### 修改方案

#### 6.1 后端 API
新增 `server/api/user/delete.post.ts`:
```typescript
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { password } = await readBody(event)

  // 1. 验证密码
  // 2. 删除顺序（避免外键约束）：
  //    - messages (通过 conversations)
  //    - conversations
  //    - assistants
  //    - aimodels (通过 upstreams)
  //    - upstreams
  //    - tasks
  //    - userSettings
  //    - users
  // 3. 清除 session/token

  return { success: true }
})
```

#### 6.2 前端 UI
在 `app/pages/user.vue` 添加危险区域卡片：
- 标题：删除账号
- 警告说明
- 密码输入框
- 确认删除按钮（红色）
- 二次确认弹窗

### 涉及文件
- `server/api/user/delete.post.ts` - 新增
- `app/pages/user.vue` - 添加删除账号区域

---

## 7. 助手列表添加按钮位置

### 需求
"添加助手按钮"移动到助手列表最后，而不是固定在底部。

### 当前实现
- 文件：`app/components/chat/AssistantList.vue`
- 结构：
  ```vue
  <div class="h-full flex flex-col">
    <div>标题</div>
    <div class="flex-1 overflow-y-auto">助手列表</div>
    <div class="border-t">固定底部的新建按钮</div>
  </div>
  ```

### 修改方案
参考 `app/pages/settings/upstreams/[id].vue` 的模型添加按钮样式：

1. 移除固定底部的按钮区域
2. 在助手列表内部末尾添加虚线边框按钮：
   ```vue
   <div class="flex-1 overflow-y-auto p-2 space-y-2">
     <!-- 助手列表 -->
     <button v-for="assistant in sortedAssistants" ...>
       ...
     </button>

     <!-- 新建按钮 -->
     <button
       class="w-full p-3 rounded-lg border-2 border-dashed border-(--ui-border)
              hover:border-(--ui-primary) hover:bg-(--ui-primary)/5
              flex items-center justify-center gap-2"
       @click="emit('create')"
     >
       <UIcon name="i-heroicons-plus" class="w-5 h-5" />
       <span>新建助手</span>
     </button>
   </div>
   ```

### 涉及文件
- `app/components/chat/AssistantList.vue`

---

## 实现顺序建议

1. **删除助手确认框样式统一**（一行代码修改）
2. **助手列表添加按钮位置**（简单 UI 调整）
3. **嵌入式绘图组件按钮优化**（UI 交互）
4. **消息气泡显示模型和大小**（UI + 计算逻辑）
5. **代码块深色模式适配**（需要调试 Shiki）
6. **开场白缓存到数据库**（数据库迁移 + API 修改）
7. **删除账号功能**（需谨慎测试）

---

## 数据库迁移计划

需要新增的迁移：
1. `assistants` 表添加 `suggestions` 字段（JSON 类型）

```sql
ALTER TABLE assistants ADD COLUMN suggestions TEXT;
```

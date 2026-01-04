# AI 群聊功能设计文档

## 一、产品定位

MJ Studio 的 AI 群聊功能旨在实现**多个 AI 助手和多个用户在同一对话空间中的智能协作**。不同于传统的一对一对话，群聊模式能够：

- **多助手协同**：多个专业助手在同一对话中发挥各自优势
- **智能参与决策**：每个助手自主判断是否需要参与回复
- **避免无效打扰**：助手不会对不相关的话题进行接话
- **成员感知**：所有参与方实时了解当前群聊中有哪些成员
- **多用户协作**：支持多个真人用户同时参与对话

## 二、用户感知到的效果

### 场景 1：多助手专业分工

**群聊成员**：用户、前端专家助手、后端专家助手、UI 设计助手

```
用户："我要做一个用户登录功能"

后端专家："我来负责认证部分。建议使用 JWT + refresh token 方案，
           session 存储在 Redis..."

前端专家："前端我建议用 Pinia 管理登录状态，配合路由守卫..."

UI 设计助手："登录页面建议采用居中卡片布局，支持深色模式..."
```

### 场景 2：智能接话判断

**群聊成员**：用户、代码助手、绘图助手

```
用户："帮我重构这段 TypeScript 代码"

代码助手："好的，我看到你使用了 any 类型，建议改为..."

（绘图助手没有回复，因为判断这个话题与自己无关）

---

用户："顺便帮我生成一张赛博朋克风格的 banner"

绘图助手："收到！我会使用 Midjourney 生成，参数建议..."

（代码助手没有回复，因为判断这个话题与自己无关）
```

### 场景 3：助手状态追踪

**群聊成员**：用户、项目管理助手、技术助手

```
用户："我们讨论一下数据库设计"

技术助手："好的，根据你的需求，我建议..."

项目管理助手（内部思考）："这是技术细节讨论，我不参与"

---

（讨论了 10 轮数据库细节后）

用户："那这个功能的开发排期怎么安排？"

项目管理助手："根据刚才讨论的数据库设计复杂度，建议分 3 个迭代..."
          （虽然之前没有参与，但一直在跟踪对话内容）

技术助手（内部思考）："排期规划不是我的专业，项目管理助手会处理"
```

### 场景 4：新成员加入通知

```
用户邀请了"安全专家助手"加入群聊

系统通知："安全专家助手 已加入群聊"

安全专家助手："你好！我看到之前讨论了用户认证方案，我补充一些安全建议：
              1. 密码需要加盐哈希（bcrypt/argon2）
              2. 实施登录失败限流
              3. ..."

（其他助手收到新成员加入的通知，了解到群聊中新增了安全专家）
```

## 三、核心架构设计

### 3.1 数据模型

#### 表：`group_conversations`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| title | string | 群聊标题 |
| createdBy | integer | 创建者用户 ID |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 最后更新时间 |

#### 表：`group_members`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| groupConversationId | integer | 群聊 ID |
| memberType | enum | 'user' \| 'assistant' |
| memberId | integer | 用户 ID 或助手 ID |
| participationState | json | 参与状态（见下文） |
| joinedAt | timestamp | 加入时间 |
| lastActiveAt | timestamp | 最后活跃时间 |

**participationState 结构**（仅助手成员使用）：

```typescript
interface ParticipationState {
  // 当前是否在跟踪对话（即使不回复也在关注）
  isTracking: boolean

  // 最后一次思考的结果
  lastThought: {
    messageId: number          // 针对哪条消息进行的思考
    shouldReply: boolean       // 是否决定回复
    reason: string             // 决策原因（用于调试和优化）
    relevanceScore: number     // 话题相关性评分 0-1
    timestamp: Date
  } | null

  // 当前关注的话题标签（由助手自行维护）
  activeTopics: string[]       // 例如: ['数据库设计', 'TypeScript']

  // 不参与的话题标签（由助手自行维护）
  mutedTopics: string[]        // 例如: ['UI 设计', '项目排期']
}
```

#### 表：`group_messages`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| groupConversationId | integer | 群聊 ID |
| senderType | enum | 'user' \| 'assistant' \| 'system' |
| senderId | integer | 发送者 ID（用户/助手） |
| content | text | 消息内容 |
| attachments | json | 附件列表 |
| status | enum | 'pending' \| 'streaming' \| 'completed' \| 'failed' |
| createdAt | timestamp | 创建时间 |

#### 表：`group_assistant_thoughts`（助手思考记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| groupConversationId | integer | 群聊 ID |
| assistantId | integer | 助手 ID |
| messageId | integer | 针对的消息 ID |
| shouldReply | boolean | 是否决定回复 |
| reason | text | 决策原因 |
| relevanceScore | float | 相关性评分 0-1 |
| topics | json | 提取的话题标签 |
| thoughtAt | timestamp | 思考时间 |

**设计说明**：

- 助手的思考过程不作为消息存储，但记录在独立的表中用于分析和优化
- 用户看不到助手的思考过程，只看到最终是否回复
- 思考记录可用于后续优化决策模型

### 3.2 成员发现机制

**新成员加入时的通知流程**：

```
新成员加入群聊
  ↓
1. 写入 group_members 表
  ↓
2. 创建系统消息（group_messages）
   senderType: 'system'
   content: "XXX 加入了群聊"
  ↓
3. 通过全局事件推送给所有在线成员
   事件类型: 'group.member.joined'
   数据: { groupId, member, currentMembers }
  ↓
4. 前端更新群成员列表
  ↓
5. 新成员收到当前群聊的完整成员列表
   API: GET /api/groups/:id/members
  ↓
6. 新成员收到最近的历史消息（可配置条数）
   API: GET /api/groups/:id/messages?limit=50
```

**实时成员列表同步**：

- 所有成员通过全局 SSE 订阅接收成员变更事件
- 前端维护本地成员列表状态，通过事件增量更新
- 支持成员在线状态显示（基于 SSE 连接状态）

### 3.3 助手响应决策机制

**核心原理**：每条新消息触发所有助手并行思考，但思考过程不产生可见消息。

#### 决策流程

```
用户发送新消息
  ↓
1. 消息写入数据库（status: 'completed'）
  ↓
2. 通过全局事件推送给所有群成员
   事件类型: 'group.message.created'
  ↓
3. 服务端触发助手思考任务（异步并行）
   对于每个助手成员：
     ↓
     3.1 获取助手的上下文
         - 助手的 System Prompt
         - 助手的 participationState
         - 最近 20 条群聊消息
         - 当前消息内容
     ↓
     3.2 调用 LLM 进行思考（小模型，如 GPT-4o-mini）
         System Prompt:
         """
         你是群聊中的助手"{助手名称}"。
         你的专业领域：{助手描述}

         当前跟踪的话题：{activeTopics}
         不参与的话题：{mutedTopics}

         请根据以下最新消息，判断你是否需要参与回复：

         最近消息：
         {最近 20 条消息}

         最新消息：
         {当前消息}

         请输出 JSON 格式：
         {
           "shouldReply": boolean,
           "reason": "决策原因",
           "relevanceScore": 0-1,
           "topics": ["话题1", "话题2"],
           "replyContent": "如果决定回复，这里是回复内容（可选）"
         }
         """
     ↓
     3.3 LLM 返回决策结果
         示例输出：
         {
           "shouldReply": false,
           "reason": "这是关于前端组件设计的讨论，不属于我的后端专业领域",
           "relevanceScore": 0.2,
           "topics": ["前端", "组件设计"],
           "replyContent": null
         }
     ↓
     3.4 更新助手的 participationState
         - 更新 lastThought
         - 更新 activeTopics/mutedTopics（基于 topics 分析）
     ↓
     3.5 记录思考到 group_assistant_thoughts 表
     ↓
     3.6 如果 shouldReply = true，创建助手回复消息
         - 写入 group_messages（status: 'pending'）
         - 调用对话生成服务（流式输出）
         - 通过全局事件推送流式内容
  ↓
4. 所有助手思考完成（并行，约 1-2 秒）
  ↓
5. 决定回复的助手开始流式输出回复
```

#### 决策优化策略

**成本控制**：

| 配置项 | 值 | 理由 |
|--------|-----|------|
| **思考模型** | GPT-4o-mini 或 DeepSeek | 决策任务简单，使用小模型降低成本 |
| **上下文窗口** | 最近 20 条消息 | 足够判断话题，避免完整历史 |
| **并行处理** | 所有助手同时思考 | 总延迟 = 单个助手思考时间（1-2秒） |
| **Token 消耗** | 约 2000 tokens/助手 | 5 个助手 = 10k tokens ≈ $0.001 |

**相关性评分机制**：

```typescript
// 相关性评分综合计算
function calculateRelevance(
  llmScore: number,           // LLM 返回的 relevanceScore (0-1)
  topicMatch: number,         // 话题匹配度 (0-1)
  recentActivity: number,     // 最近活跃度 (0-1)
  userMention: boolean        // 是否被 @ 提及
): number {
  let score = llmScore * 0.6 + topicMatch * 0.3 + recentActivity * 0.1

  // 被 @ 提及时强制参与
  if (userMention) {
    score = Math.max(score, 0.9)
  }

  return score
}

// 决策阈值
const REPLY_THRESHOLD = 0.6        // 高于此分数则回复
const TRACK_THRESHOLD = 0.3        // 高于此分数则继续跟踪话题
const MUTE_THRESHOLD = 0.1         // 低于此分数则加入 mutedTopics
```

**防止助手沉默**：

如果连续 10 条消息所有助手都判断不回复，触发提醒机制：

- 降低决策阈值（REPLY_THRESHOLD 从 0.6 降到 0.4）
- 在思考 Prompt 中添加："群聊已经很久没有助手回复了，如果你有任何相关见解，请积极参与"

**防止助手过度回复**：

如果某个助手在最近 10 条消息中回复了 7 条以上：

- 提高该助手的决策阈值（REPLY_THRESHOLD 从 0.6 升到 0.75）
- 在思考 Prompt 中添加："你最近回复较多,请只在确实有重要补充时才参与"

### 3.4 消息流式输出

**多助手并发流式输出**：

- 每个助手的回复是独立的流式任务
- 前端同时显示多个助手的打字机效果
- 使用全局 SSE 推送流式 delta 事件

```typescript
// 全局事件类型
interface GroupMessageDeltaEvent {
  type: 'group.message.delta'
  data: {
    groupId: number
    messageId: number
    assistantId: number
    delta: string           // 增量内容
    isFirst: boolean        // 是否是第一个 chunk
  }
}

interface GroupMessageDoneEvent {
  type: 'group.message.done'
  data: {
    groupId: number
    messageId: number
    assistantId: number
    finalContent: string
  }
}
```

**前端渲染逻辑**：

```typescript
// app/composables/useGroupConversation.ts
export function useGroupConversation(groupId: number) {
  const messages = ref<GroupMessage[]>([])
  const streamingMessages = ref<Map<number, string>>(new Map())

  // 监听流式输出
  globalEvents.on('group.message.delta', (event) => {
    if (event.data.groupId !== groupId) return

    if (event.data.isFirst) {
      // 创建新的流式消息占位符
      messages.value.push({
        id: event.data.messageId,
        assistantId: event.data.assistantId,
        content: '',
        status: 'streaming'
      })
    }

    // 追加增量内容
    const current = streamingMessages.get(event.data.messageId) || ''
    streamingMessages.set(event.data.messageId, current + event.data.delta)
  })

  globalEvents.on('group.message.done', (event) => {
    if (event.data.groupId !== groupId) return

    // 更新为最终内容
    const msg = messages.value.find(m => m.id === event.data.messageId)
    if (msg) {
      msg.content = event.data.finalContent
      msg.status = 'completed'
    }
    streamingMessages.delete(event.data.messageId)
  })

  return { messages, streamingMessages }
}
```

## 四、用户界面设计

### 4.1 群聊列表页面

**位置**：`/group-chat`（新增页面）

```
┌─────────────────────────────────────────────────────┐
│  群聊                                    [+ 新建群聊] │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐ │
│  │ 📁 前端开发讨论组                       3 条新消息 │
│  │ 成员：你、前端专家、UI 设计师                     │
│  │ 最后消息：前端专家: 建议使用 Tailwind... (2分钟前)│
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ 📁 MJ Studio 项目组                             │
│  │ 成员：你、代码助手、项目管理助手、张三            │
│  │ 最后消息：你: 今天的进度怎么样？ (1小时前)        │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ 📁 AI 绘图研究                                  │
│  │ 成员：你、绘图助手                              │
│  │ 最后消息：绘图助手: 新的 Flux 模型... (昨天)    │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 群聊对话页面

**布局**：三栏式（桌面端）/ 单栏式（移动端）

```
┌─────────────────────────────────────────────────────────────────┐
│  [<返回] 前端开发讨论组        [成员 4] [设置]                     │
├─────────────┬───────────────────────────────┬───────────────────┤
│             │                               │  群成员            │
│  对话历史    │   用户 (刚刚)                 │  ────────         │
│  ────────   │   帮我优化这个组件性能          │  👤 你            │
│             │                               │  🤖 前端专家       │
│  [最近]     │   前端专家 (思考中...)         │  🤖 UI 设计师      │
│  [本周]     │   ⚡ 正在思考是否回复...        │  🤖 代码审查助手   │
│  [本月]     │                               │                   │
│  [更早]     │   前端专家 (1秒前)             │  [+ 邀请成员]     │
│             │   我注意到你使用了频繁的re-render │                 │
│             │   建议使用 useMemo 和...       │  ──────────       │
│             │   (流式输出中...)              │  话题标签          │
│             │                               │  #性能优化        │
│             │   UI 设计师 (思考中...)        │  #组件设计        │
│             │   ⚡ 正在思考是否回复...        │  #React          │
│             │                               │                   │
│             │   代码审查助手 (2秒前)         │                   │
│             │   补充一下,这段代码还有...      │                   │
│             │                               │                   │
├─────────────┴───────────────────────────────┴───────────────────┤
│  [📎]  输入消息... (@提及成员)                         [发送]     │
└─────────────────────────────────────────────────────────────────┘
```

**关键 UI 元素**：

1. **助手思考状态**：
   - 显示"⚡ 正在思考是否回复..."（仅显示 1-2 秒）
   - 如果决定回复,立即切换到流式输出
   - 如果决定不回复,思考状态消失

2. **成员在线状态**：
   - 在线：绿色圆点
   - 离线：灰色圆点
   - 助手：橙色齿轮图标（表示 AI）

3. **@ 提及功能**：
   - 输入 `@` 触发成员选择器
   - 被 @ 的助手必定参与回复

4. **话题标签**：
   - 右侧栏显示当前群聊的热门话题
   - 从助手的思考记录中提取
   - 点击话题可筛选相关消息

### 4.3 新建群聊弹窗

```
┌─────────────────────────────────────────┐
│  创建新群聊                              │
├─────────────────────────────────────────┤
│  群聊名称                                │
│  [前端开发讨论组____________________]    │
│                                         │
│  添加成员                                │
│  ┌─────────────────────────────────┐   │
│  │ [搜索成员或助手...]              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  已选择成员：                            │
│  ┌─────────────────────────────────┐   │
│  │ 🤖 前端专家            [移除]     │   │
│  │ 🤖 UI 设计师           [移除]     │   │
│  │ 👤 张三 (协作者)       [移除]     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  快速模板：                              │
│  [全栈开发组] [AI 绘图研究] [自定义]    │
│                                         │
│              [取消]          [创建]     │
└─────────────────────────────────────────┘
```

**快速模板**：

- **全栈开发组**：前端专家 + 后端专家 + 数据库专家
- **AI 绘图研究**：绘图助手 + 提示词专家
- **产品设计**：UI 设计师 + 产品经理助手 + 用户体验专家

### 4.4 群聊设置页面

```
┌─────────────────────────────────────────┐
│  群聊设置                                │
├─────────────────────────────────────────┤
│  基本信息                                │
│  ────────                               │
│  群聊名称                                │
│  [前端开发讨论组____________________]    │
│                                         │
│  成员管理                                │
│  ────────                               │
│  🤖 前端专家                [移除]       │
│     └ 活跃度：⭐⭐⭐⭐⭐              │
│     └ 参与话题：#React #性能优化         │
│                                         │
│  🤖 UI 设计师               [移除]       │
│     └ 活跃度：⭐⭐⭐☆☆              │
│     └ 参与话题：#UI设计 #色彩           │
│                                         │
│  👤 张三                   [移除]       │
│     └ 最后在线：5分钟前                  │
│                                         │
│  [+ 添加成员]                           │
│                                         │
│  助手行为设置                            │
│  ────────                               │
│  ☑ 允许助手自动判断是否回复              │
│  ☑ 显示助手思考状态                      │
│  ☐ 要求助手说明为何不回复（调试模式）     │
│                                         │
│  决策灵敏度：                            │
│  [───────●────] (0.6)                  │
│   保守          积极                     │
│                                         │
│  危险操作                                │
│  ────────                               │
│  [解散群聊]                              │
└─────────────────────────────────────────┘
```

## 五、API 接口设计

### 5.1 群聊管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/groups` | GET | 获取用户的群聊列表 |
| `/api/groups` | POST | 创建新群聊 |
| `/api/groups/:id` | GET | 获取群聊详情 |
| `/api/groups/:id` | PUT | 更新群聊信息（标题等） |
| `/api/groups/:id` | DELETE | 解散群聊 |

### 5.2 成员管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/groups/:id/members` | GET | 获取群成员列表 |
| `/api/groups/:id/members` | POST | 添加成员（用户或助手） |
| `/api/groups/:id/members/:memberId` | DELETE | 移除成员 |
| `/api/groups/:id/members/:memberId/state` | GET | 获取助手参与状态 |

### 5.3 消息管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/groups/:id/messages` | GET | 获取群聊消息（分页） |
| `/api/groups/:id/messages` | POST | 发送消息 |
| `/api/groups/:id/messages/:messageId` | DELETE | 删除消息 |

### 5.4 助手思考记录（调试用）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/groups/:id/thoughts` | GET | 获取助手思考记录（管理员） |
| `/api/groups/:id/thoughts/stats` | GET | 思考统计（回复率、话题分布） |

## 六、全局事件集成

### 6.1 新增事件类型

| 事件类型 | 触发时机 | 数据 |
|---------|---------|------|
| `group.created` | 群聊创建成功 | `{ group }` |
| `group.updated` | 群聊信息更新 | `{ groupId, updates }` |
| `group.deleted` | 群聊解散 | `{ groupId }` |
| `group.member.joined` | 成员加入 | `{ groupId, member, currentMembers }` |
| `group.member.left` | 成员离开 | `{ groupId, memberId }` |
| `group.message.created` | 消息创建（用户/系统消息） | `{ groupId, message }` |
| `group.message.delta` | 助手流式输出 | `{ groupId, messageId, assistantId, delta }` |
| `group.message.done` | 助手回复完成 | `{ groupId, messageId, assistantId, finalContent }` |
| `group.assistant.thinking` | 助手开始思考 | `{ groupId, assistantId, messageId }` |
| `group.assistant.decided` | 助手决策完成 | `{ groupId, assistantId, shouldReply, reason }` |

### 6.2 事件订阅策略

**群成员自动订阅**：

- 用户加入群聊后,自动订阅该群聊的所有事件
- 通过全局 SSE 连接接收事件
- 前端根据 `groupId` 筛选事件

**离线消息处理**：

- 用户离线时错过的消息通过 API 获取（`GET /api/groups/:id/messages?since=lastSeenMessageId`）
- 重新上线后先拉取离线消息,再开始实时订阅

## 七、核心服务实现

### 7.1 GroupConversationService

```typescript
// server/services/groupConversation.ts

export class GroupConversationService {
  /**
   * 创建群聊
   */
  async create(userId: number, title: string, memberIds: {
    assistants: number[]
    users: number[]
  }) {
    // 1. 创建群聊记录
    // 2. 添加成员
    // 3. 发送系统消息"群聊已创建"
    // 4. 发送全局事件 group.created
  }

  /**
   * 添加成员
   */
  async addMember(groupId: number, memberType: 'user' | 'assistant', memberId: number) {
    // 1. 写入 group_members
    // 2. 创建系统消息"XXX 加入群聊"
    // 3. 发送全局事件 group.member.joined
    // 4. 如果是助手,初始化 participationState
  }

  /**
   * 处理新消息
   */
  async handleNewMessage(groupId: number, userId: number, content: string) {
    // 1. 创建消息记录
    const message = await db.insert(groupMessages).values({
      groupConversationId: groupId,
      senderType: 'user',
      senderId: userId,
      content,
      status: 'completed'
    })

    // 2. 发送全局事件 group.message.created
    globalEvents.emitToGroup(groupId, 'group.message.created', { message })

    // 3. 触发助手思考任务（异步）
    await this.triggerAssistantThoughts(groupId, message.id)
  }

  /**
   * 触发助手思考
   */
  private async triggerAssistantThoughts(groupId: number, messageId: number) {
    // 1. 获取所有助手成员
    const assistants = await this.getAssistantMembers(groupId)

    // 2. 并行触发思考任务
    await Promise.all(
      assistants.map(assistant =>
        this.assistantThink(groupId, assistant, messageId)
      )
    )
  }

  /**
   * 单个助手思考
   */
  private async assistantThink(
    groupId: number,
    assistant: AssistantMember,
    messageId: number
  ) {
    // 1. 发送思考状态事件
    globalEvents.emitToGroup(groupId, 'group.assistant.thinking', {
      assistantId: assistant.id,
      messageId
    })

    // 2. 获取上下文
    const context = await this.buildThoughtContext(groupId, assistant, messageId)

    // 3. 调用 LLM 进行决策
    const decision = await this.callThoughtLLM(assistant, context)

    // 4. 记录思考结果
    await db.insert(groupAssistantThoughts).values({
      groupConversationId: groupId,
      assistantId: assistant.id,
      messageId,
      shouldReply: decision.shouldReply,
      reason: decision.reason,
      relevanceScore: decision.relevanceScore,
      topics: decision.topics,
      thoughtAt: new Date()
    })

    // 5. 更新 participationState
    await this.updateParticipationState(groupId, assistant.id, decision)

    // 6. 发送决策完成事件
    globalEvents.emitToGroup(groupId, 'group.assistant.decided', {
      assistantId: assistant.id,
      shouldReply: decision.shouldReply,
      reason: decision.reason
    })

    // 7. 如果决定回复,创建回复消息并流式输出
    if (decision.shouldReply) {
      await this.generateAssistantReply(groupId, assistant, messageId, context)
    }
  }

  /**
   * 构建思考上下文
   */
  private async buildThoughtContext(
    groupId: number,
    assistant: AssistantMember,
    messageId: number
  ) {
    // 1. 获取助手的 System Prompt
    const assistantInfo = await db.query.assistants.findFirst({
      where: eq(assistants.id, assistant.assistantId)
    })

    // 2. 获取最近 20 条消息
    const recentMessages = await db.query.groupMessages.findMany({
      where: eq(groupMessages.groupConversationId, groupId),
      orderBy: desc(groupMessages.createdAt),
      limit: 20
    })

    // 3. 获取当前消息
    const currentMessage = await db.query.groupMessages.findFirst({
      where: eq(groupMessages.id, messageId)
    })

    // 4. 获取助手的 participationState
    const state = assistant.participationState

    return {
      assistantPrompt: assistantInfo.systemPrompt,
      participationState: state,
      recentMessages: recentMessages.reverse(),
      currentMessage
    }
  }

  /**
   * 调用 LLM 进行思考决策
   */
  private async callThoughtLLM(assistant: AssistantMember, context: any) {
    const messages = [
      {
        role: 'system',
        content: `你是群聊中的助手"${assistant.name}"。
你的专业领域：${context.assistantPrompt}

当前跟踪的话题：${context.participationState.activeTopics.join(', ')}
不参与的话题：${context.participationState.mutedTopics.join(', ')}

请根据以下最新消息,判断你是否需要参与回复。

最近消息：
${context.recentMessages.map(m => `${m.senderType}: ${m.content}`).join('\n')}

最新消息：
${context.currentMessage.content}

请输出 JSON 格式：
{
  "shouldReply": boolean,
  "reason": "决策原因",
  "relevanceScore": 0-1,
  "topics": ["话题1", "话题2"]
}`
      }
    ]

    // 使用小模型（GPT-4o-mini 或 DeepSeek）
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    return JSON.parse(response.choices[0].message.content)
  }

  /**
   * 生成助手回复（流式）
   */
  private async generateAssistantReply(
    groupId: number,
    assistant: AssistantMember,
    replyToMessageId: number,
    context: any
  ) {
    // 1. 创建消息记录
    const replyMessage = await db.insert(groupMessages).values({
      groupConversationId: groupId,
      senderType: 'assistant',
      senderId: assistant.assistantId,
      content: '',
      status: 'pending'
    })

    // 2. 调用对话生成服务（流式）
    const stream = await chatService.generateStream({
      assistantId: assistant.assistantId,
      messages: context.recentMessages,
      onDelta: (delta) => {
        // 推送流式增量
        globalEvents.emitToGroup(groupId, 'group.message.delta', {
          messageId: replyMessage.id,
          assistantId: assistant.assistantId,
          delta,
          isFirst: delta === '<first>'
        })
      }
    })

    // 3. 流式完成后更新消息
    const finalContent = await stream.getFinalContent()
    await db.update(groupMessages)
      .set({ content: finalContent, status: 'completed' })
      .where(eq(groupMessages.id, replyMessage.id))

    // 4. 发送完成事件
    globalEvents.emitToGroup(groupId, 'group.message.done', {
      messageId: replyMessage.id,
      assistantId: assistant.assistantId,
      finalContent
    })
  }
}
```

### 7.2 全局事件扩展

```typescript
// server/services/globalEvents.ts

export class GlobalEventsService {
  // 现有方法...

  /**
   * 向群聊的所有成员发送事件
   */
  async emitToGroup(groupId: number, eventType: string, data: any) {
    // 1. 获取群聊的所有用户成员
    const members = await db.query.groupMembers.findMany({
      where: and(
        eq(groupMembers.groupConversationId, groupId),
        eq(groupMembers.memberType, 'user')
      )
    })

    // 2. 向每个用户发送事件
    for (const member of members) {
      this.emitToUser(member.memberId, eventType, data)
    }
  }
}
```

## 八、前端 Composables

### 8.1 useGroupConversations

```typescript
// app/composables/useGroupConversations.ts

export function useGroupConversations() {
  const groups = ref<GroupConversation[]>([])
  const loading = ref(false)

  // 获取群聊列表
  async function fetchGroups() {
    loading.value = true
    try {
      const data = await $fetch('/api/groups')
      groups.value = data
    } finally {
      loading.value = false
    }
  }

  // 创建群聊
  async function createGroup(title: string, memberIds: {
    assistants: number[]
    users: number[]
  }) {
    const group = await $fetch('/api/groups', {
      method: 'POST',
      body: { title, memberIds }
    })
    groups.value.unshift(group)
    return group
  }

  // 订阅全局事件
  const globalEvents = useGlobalEvents()

  globalEvents.on('group.created', (event) => {
    if (!groups.value.find(g => g.id === event.data.group.id)) {
      groups.value.unshift(event.data.group)
    }
  })

  globalEvents.on('group.deleted', (event) => {
    const index = groups.value.findIndex(g => g.id === event.data.groupId)
    if (index !== -1) {
      groups.value.splice(index, 1)
    }
  })

  onMounted(() => {
    fetchGroups()
  })

  return {
    groups,
    loading,
    fetchGroups,
    createGroup
  }
}
```

### 8.2 useGroupMessages

```typescript
// app/composables/useGroupMessages.ts

export function useGroupMessages(groupId: number) {
  const messages = ref<GroupMessage[]>([])
  const streamingMessages = ref<Map<number, string>>(new Map())
  const thinkingAssistants = ref<Set<number>>(new Set())

  // 获取消息列表
  async function fetchMessages(limit = 50) {
    const data = await $fetch(`/api/groups/${groupId}/messages`, {
      query: { limit }
    })
    messages.value = data
  }

  // 发送消息
  async function sendMessage(content: string) {
    await $fetch(`/api/groups/${groupId}/messages`, {
      method: 'POST',
      body: { content }
    })
  }

  // 订阅全局事件
  const globalEvents = useGlobalEvents()

  // 新消息创建
  globalEvents.on('group.message.created', (event) => {
    if (event.data.message.groupConversationId !== groupId) return
    messages.value.push(event.data.message)
  })

  // 助手思考中
  globalEvents.on('group.assistant.thinking', (event) => {
    if (event.data.groupId !== groupId) return
    thinkingAssistants.value.add(event.data.assistantId)
  })

  // 助手决策完成
  globalEvents.on('group.assistant.decided', (event) => {
    if (event.data.groupId !== groupId) return
    thinkingAssistants.value.delete(event.data.assistantId)

    // 如果不回复,可以在 UI 中短暂显示原因（可选）
    if (!event.data.shouldReply && import.meta.dev) {
      console.log(`助手 ${event.data.assistantId} 不回复:`, event.data.reason)
    }
  })

  // 流式输出 delta
  globalEvents.on('group.message.delta', (event) => {
    if (event.data.groupId !== groupId) return

    if (event.data.isFirst) {
      // 创建流式消息占位符
      messages.value.push({
        id: event.data.messageId,
        senderType: 'assistant',
        senderId: event.data.assistantId,
        content: '',
        status: 'streaming'
      })
    }

    // 追加增量
    const current = streamingMessages.value.get(event.data.messageId) || ''
    streamingMessages.value.set(event.data.messageId, current + event.data.delta)
  })

  // 流式输出完成
  globalEvents.on('group.message.done', (event) => {
    if (event.data.groupId !== groupId) return

    const msg = messages.value.find(m => m.id === event.data.messageId)
    if (msg) {
      msg.content = event.data.finalContent
      msg.status = 'completed'
    }
    streamingMessages.value.delete(event.data.messageId)
  })

  onMounted(() => {
    fetchMessages()
  })

  return {
    messages,
    streamingMessages,
    thinkingAssistants,
    sendMessage,
    fetchMessages
  }
}
```

### 8.3 useGroupMembers

```typescript
// app/composables/useGroupMembers.ts

export function useGroupMembers(groupId: number) {
  const members = ref<GroupMember[]>([])

  async function fetchMembers() {
    const data = await $fetch(`/api/groups/${groupId}/members`)
    members.value = data
  }

  async function addMember(memberType: 'user' | 'assistant', memberId: number) {
    await $fetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: { memberType, memberId }
    })
  }

  async function removeMember(memberId: number) {
    await $fetch(`/api/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE'
    })
  }

  // 订阅成员变更事件
  const globalEvents = useGlobalEvents()

  globalEvents.on('group.member.joined', (event) => {
    if (event.data.groupId !== groupId) return
    members.value = event.data.currentMembers
  })

  globalEvents.on('group.member.left', (event) => {
    if (event.data.groupId !== groupId) return
    members.value = members.value.filter(m => m.id !== event.data.memberId)
  })

  onMounted(() => {
    fetchMembers()
  })

  return {
    members,
    addMember,
    removeMember,
    fetchMembers
  }
}
```

## 九、MVP 阶段计划

### 9.1 目标

- ✅ 实现基础的群聊创建和成员管理
- ✅ 实现助手思考决策机制
- ✅ 实现多助手并发流式回复
- ✅ 实现成员实时同步
- ❌ 暂不实现话题标签提取
- ❌ 暂不实现助手活跃度统计

### 9.2 测试场景

准备 2 类测试群聊：

1. **全栈开发群聊**：
   - 成员：用户、前端专家、后端专家
   - 测试消息："帮我设计一个用户登录功能"
   - 预期：两个助手都应该回复（前端负责页面,后端负责 API）

2. **混合话题群聊**：
   - 成员：用户、代码助手、绘图助手
   - 测试消息 1："优化这段代码性能"
   - 预期：只有代码助手回复
   - 测试消息 2："生成一张赛博朋克风格的图"
   - 预期：只有绘图助手回复

### 9.3 观察指标

- **决策准确性**：助手是否正确判断何时该回复/不回复？
- **响应延迟**：从消息发送到助手开始回复的时间（目标 < 3 秒）
- **并发稳定性**：多个助手同时回复时是否有冲突或错误？
- **成本控制**：每条消息触发的思考成本是否在预期范围内？

### 9.4 MVP 不包含的功能

- ❌ 话题标签自动提取
- ❌ 助手活跃度统计和可视化
- ❌ 多用户协作（仅支持单用户 + 多助手）
- ❌ 消息编辑和删除
- ❌ 群聊搜索和筛选

## 十、正式实施阶段

### 10.1 多用户协作

**扩展支持真人用户加入群聊**：

- 实现用户邀请机制（邀请链接或用户 ID）
- 实现用户权限管理（创建者/管理员/普通成员）
- 实现 @ 提及真人用户

### 10.2 话题标签系统

**自动提取和维护话题标签**：

- 从助手的思考记录中提取 topics
- 统计话题出现频率，生成热门话题列表
- 支持按话题筛选消息

### 10.3 助手行为优化

**基于历史数据优化决策模型**：

- 收集用户反馈（"这个回复有用吗？"）
- 分析助手回复的有效性
- 调整决策阈值和 Prompt

### 10.4 高级功能

- ✅ 消息引用和回复（类似 Slack 的 thread）
- ✅ 群聊内搜索
- ✅ 消息置顶
- ✅ 群聊归档
- ✅ 导出聊天记录

## 十一、成本和性能考虑

### 11.1 成本估算

**单条消息的成本**（5 个助手的群聊）：

| 项目 | Token 消耗 | 单价 | 成本 |
|------|-----------|------|------|
| 思考决策（5 个助手） | 5 × 2000 = 10k tokens | $0.15/1M (GPT-4o-mini) | $0.0015 |
| 助手回复（假设 2 个回复） | 2 × 1500 = 3k tokens | $3/1M (GPT-4o) | $0.009 |
| **总计** | 13k tokens | - | **$0.0105** |

**月度成本估算**（100 个活跃群聊，每天 50 条消息）：

- 每日消息数：100 × 50 = 5000 条
- 每日成本：5000 × $0.0105 = **$52.5**
- 每月成本：$52.5 × 30 = **$1575**

**优化方向**：

- 使用更小的模型进行思考决策（DeepSeek-R1-Distill）
- 缓存最近的上下文，避免重复编码
- 限制单个群聊的助手数量（建议 ≤ 5 个）

### 11.2 性能优化

**并发思考延迟优化**：

- 所有助手并行思考，总延迟 = 单个思考时间（约 1-2 秒）
- 使用流式 API 降低 TTFB（首字节时间）
- 预加载上下文（提前缓存最近 20 条消息）

**数据库查询优化**：

- 为 `group_members.groupConversationId` 添加索引
- 为 `group_messages.groupConversationId + createdAt` 添加复合索引
- 使用分页查询避免一次性加载大量消息

## 十二、风险和挑战

### 12.1 技术风险

- **决策准确性**：助手可能误判是否该回复
- **上下文爆炸**：长期对话导致上下文过长
- **并发冲突**：多个助手同时写入消息可能冲突

**缓解措施**：

- 提供用户反馈机制，持续优化决策 Prompt
- 限制上下文窗口大小（最近 20 条消息）
- 数据库事务保证写入一致性

### 12.2 产品风险

- **助手过度沉默**：所有助手都不回复，用户感到冷场
- **助手过度活跃**：每条消息都有 5 个助手回复，信息过载
- **用户困惑**：不理解助手为何不回复

**缓解措施**：

- 实施防沉默机制（连续 10 条无回复时降低阈值）
- 实施防过度回复机制（单个助手回复过多时提高阈值）
- 提供"调试模式"显示助手的思考原因

### 12.3 成本风险

- **Token 消耗超预期**：大量群聊活跃时成本快速上升
- **思考成本浪费**：助手思考后大部分不回复，浪费 Token

**缓解措施**：

- 设置成本预警和限额
- 优化思考 Prompt，减少 Token 消耗
- 考虑使用本地小模型进行初步筛选（如先用规则/小模型判断相关性 > 0.3，再调用 LLM 精确决策）

## 十三、成功指标

### 13.1 MVP 阶段

- ✅ 决策准确率 > 75%（正确判断是否该回复）
- ✅ 响应延迟 < 3 秒（从消息发送到助手开始回复）
- ✅ 并发稳定性：5 个助手同时回复无错误
- ✅ 成本控制：单条消息成本 < $0.02

### 13.2 正式上线后

- ✅ 用户创建群聊比例 > 30%（有 30% 的用户尝试群聊功能）
- ✅ 群聊活跃度：平均每个群聊每周 20+ 条消息
- ✅ 助手回复有效性：用户认为有用的回复 > 80%
- ✅ 防沉默机制触发率 < 10%（大部分情况助手能自然回复）

### 13.3 长期目标

- ✅ 多用户协作群聊占比 > 20%
- ✅ 用户感知到的"多助手协作效率"显著提升
- ✅ 平均群聊成员数：3-5 个（用户 + 助手）

# 视频统一格式 API

> 来源：云雾 API（OneAPI 格式）
>
> 适用于：即梦、Veo、Sora、Grok 等视频模型

## 接口列表

| 操作 | 端点 | 方法 |
|-----|------|-----|
| 创建视频 | `/v1/video/create` | POST |
| 查询任务 | `/v1/video/query` | GET |

## 创建视频

### 请求

```
POST https://yunwu.ai/v1/video/create
Authorization: Bearer <token>
Content-Type: application/json
```

### 即梦请求示例

```json
{
    "model": "jimeng-video-3.0",
    "prompt": "cat fish",
    "aspect_ratio": "16:9",
    "size": "1080P",
    "images": []
}
```

### 即梦请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| model | string | 是 | 模型名：`jimeng-video-3.0` |
| prompt | string | 是 | 提示词 |
| aspect_ratio | string | 否 | 宽高比：`16:9`、`9:16`、`4:3`、`3:4`、`1:1`、`21:9` |
| size | string | 否 | 分辨率：`720x1280`、`1280x720`、`1080P` |
| images | string[] | 否 | 参考图 URL 数组（图生视频） |

### Veo 请求示例

```json
{
    "model": "veo3.1-fast",
    "prompt": "make animate",
    "aspect_ratio": "16:9",
    "images": [
        "https://example.com/image.png"
    ],
    "enhance_prompt": true,
    "enable_upsample": true
}
```

### Veo 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| model | string | 是 | 见下方模型列表 |
| prompt | string | 是 | 提示词 |
| aspect_ratio | string | 否 | `16:9` 或 `9:16`（仅 veo3 支持） |
| images | string[] | 否 | 参考图 URL，不同模型支持数量不同 |
| enhance_prompt | boolean | 否 | 自动将中文转英文提示词 |
| enable_upsample | boolean | 否 | 启用超分 |

### Veo 模型列表

| 模型 | 特性 |
|-----|------|
| `veo2`、`veo2-fast` | 基础文生视频 |
| `veo2-fast-frames` | 支持首尾帧（最多 2 张图） |
| `veo2-fast-components` | 支持素材合成（最多 3 张图） |
| `veo2-pro`、`veo2-pro-components` | 高质量版本 |
| `veo3`、`veo3-fast` | 支持音频生成 |
| `veo3-frames`、`veo3-fast-frames` | 支持首帧 |
| `veo3-pro`、`veo3-pro-frames` | 高质量+首帧 |
| `veo3.1`、`veo3.1-fast`、`veo3.1-pro` | 最新版本，自适应首帧 |
| `veo3.1-components` | 支持素材合成（最多 3 张图） |

### 创建响应

```json
{
    "id": "jimeng:7391ad0e-9813-48ba-a742-ed0720e44e45",
    "status": "pending",
    "status_update_time": 1762241017286
}
```

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | 任务 ID，用于查询任务状态 |
| status | string | 任务状态：`pending` |
| status_update_time | number | 状态更新时间戳（毫秒） |

## 查询任务

### 请求

```
GET https://yunwu.ai/v1/video/query?id={task_id}
Authorization: Bearer <token>
```

### 请求示例

```bash
curl --location --request GET 'https://yunwu.ai/v1/video/query?id=jimeng:7391ad0e-9813-48ba-a742-ed0720e44e45' \
--header 'Accept: application/json' \
--header 'Authorization: Bearer <token>'
```

### 查询响应

```json
{
    "id": "033fa60e-f37c-4ff6-a44d-5585ffea938d",
    "status": "success",
    "video_url": "https://...",
    "enhanced_prompt": "增强后的英文提示词",
    "status_update_time": 1750323167003
}
```

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | 任务 ID（**注意：可能与创建时返回的 ID 不同，以创建时返回的为准**） |
| status | string | 任务状态：`pending`、`processing`、`success`、`failed` |
| video_url | string | 生成的视频 URL（成功时返回） |
| enhanced_prompt | string | 增强后的提示词（Veo 使用 enhance_prompt 时返回） |
| status_update_time | number | 状态更新时间戳（毫秒） |

> **重要：** 查询时必须使用**创建接口返回的 ID**（如 `jimeng:7391ad0e-...`）作为查询参数，查询响应中的 `id` 字段可能与之不同（如不带前缀），实现时应忽略响应中的 `id`，仅使用创建时存储的 ID 进行后续轮询。

## 状态码

| 状态 | 说明 |
|-----|------|
| pending | 任务已创建，等待处理 |
| processing | 任务处理中 |
| success | 任务成功，video_url 可用 |
| failed | 任务失败 |

# Sora 格式 API

> 来源：aabao 中转站（NewAPI）
>
> 文档：https://apifox.newapi.ai/383844578e0.md

## 接口列表

| 操作 | 端点 | 方法 | Content-Type |
|-----|------|-----|--------------|
| 创建视频 | `/v1/videos` | POST | multipart/form-data |
| 查询任务 | `/v1/videos/{task_id}` | GET | - |
| 获取视频 | `/v1/videos/{task_id}/content` | GET | - |

---

## 创建视频

### 请求

```
POST /v1/videos
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| model | string | 否 | `sora-2` |
| prompt | string | 是 | 提示词 |
| seconds | string | 否 | 生成秒数 |
| input_reference | file | 否 | 参考图片文件（binary） |

> **注意**：上游文档未提供 `size` 参数，但实测需要。见下方补充。

### 实测补充（文档未记录）

根据错误信息 `{"code":"invalid_size","message":"sora-2 size is invalid"}`，size 参数有效值为：

| 值 | 说明 |
|---|------|
| `720x1280` | 竖屏 |
| `1280x720` | 横屏 |
| `1024x1792` | 竖屏高分辨率 |
| `1792x1024` | 横屏高分辨率 |

### 响应示例

```json
{
  "id": "sora-2-123456",
  "object": "video",
  "model": "sora-2",
  "status": "pending",
  "progress": 0,
  "created_at": 1705123456,
  "seconds": "8"
}
```

---

## 查询任务状态

### 请求

```
GET /v1/videos/{task_id}
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | 任务 ID |
| status | string | 任务状态 |
| progress | integer | 进度百分比 |
| video_url | string | 视频 URL（成功时返回） |
| error | object | 错误信息 |

---

## 获取视频内容

### 请求

```
GET /v1/videos/{task_id}/content
Authorization: Bearer <token>
```

返回 `video/mp4` 格式的视频文件流。

---

## 状态码

| 状态 | 说明 |
|-----|------|
| pending | 等待处理 |
| processing | 处理中 |
| completed | 完成 |
| failed | 失败 |

---

## 与 ephone 的差异

| 特性 | aabao | ephone |
|-----|-------|--------|
| 模型 | sora-2 | sora-2, sora-2-pro |
| 渠道区分 | 无 | 官转/逆向 |
| 角色创建 | 不支持 | 逆向渠道支持 |
| 视频获取 | `/content` 端点 | `video_url` 字段 |

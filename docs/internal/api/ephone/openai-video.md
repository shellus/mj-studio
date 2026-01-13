# OpenAI Video 格式 API

> 来源：ephone 中转站
>
> 文档：https://apiai.apifox.cn/api-358244464.md

## 接口列表

| 操作 | 端点 | 方法 | Content-Type |
|-----|------|-----|--------------|
| 创建视频 | `/v1/videos` | POST | multipart/form-data |
| 查询任务 | `/v1/videos/{video_id}` | GET | - |
| 下载视频 | `/v1/videos/{video_id}/content` | GET | - |

---

## 模型与渠道

| 模型 | 渠道 | seconds 可选值 |
|-----|------|---------------|
| sora-2 | 官转 | `4`, `8`, `12` |
| sora-2 | 逆向 | `10`, `15` |
| sora-2-pro | 逆向 | `10`, `15`, `25` |

> **注意**：`sora-2-pro` 仅逆向渠道可用

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
| prompt | string | **是** | 提示词 |
| model | string | 否 | `sora-2`（默认）或 `sora-2-pro` |
| seconds | string | 否 | 视频时长，见上方模型与渠道表 |
| size | string | 否 | 尺寸，见下方枚举值 |
| input_reference | file | 否 | 参考图片文件（binary） |
| character_url | string | 否 | **仅逆向渠道**：创建角色的视频链接，视频中不能出现真人 |
| character_timestamps | string | 否 | **仅逆向渠道**：角色出现的秒数范围，格式 `{start},{end}`，范围 1~3 秒 |
| callback_url | string | 否 | 回调地址 |

### size 枚举值

| 值 | 说明 |
|---|------|
| `720x1280` | 竖屏 720p |
| `1280x720` | 横屏 720p |
| `1024x1792` | 竖屏高分辨率 |
| `1792x1024` | 横屏高分辨率 |

### 响应示例

```json
{
  "id": "video_68e688d4950481918ec389280c2f78140fcb904657674466",
  "object": "video",
  "model": "sora-2",
  "status": "pending",
  "progress": 0,
  "created_at": 1705123456,
  "seconds": "8",
  "size": "1280x720",
  "completed_at": null,
  "error": null,
  "expires_at": null,
  "remixed_from_video_id": null
}
```

---

## 查询任务状态

### 请求

```
GET /v1/videos/{video_id}
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | 任务 ID |
| status | string | 任务状态 |
| progress | integer | 进度百分比 |
| video_url | string | 视频 URL（成功时返回） |
| error | object/null | 错误信息 |
| created_at | integer | 创建时间戳 |
| completed_at | integer/null | 完成时间戳 |
| expires_at | integer/null | 过期时间戳 |

---

## 状态码

| 状态 | 说明 |
|-----|------|
| pending | 等待处理 |
| processing | 处理中 |
| completed | 完成 |
| failed | 失败 |

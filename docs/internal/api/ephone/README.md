# ephone 中转站 API 文档

> 来源：https://apiai.apifox.cn/api-358244464
- OpenAI > 视频接口 [创建视频任务](https://apiai.apifox.cn/api-358244464.md): 
- OpenAI > 视频接口 [重新编辑视频](https://apiai.apifox.cn/api-358250834.md): 
- OpenAI > 视频接口 [获取视频信息](https://apiai.apifox.cn/api-358250902.md): 
- OpenAI > 视频接口 [删除视频](https://apiai.apifox.cn/api-358250930.md): 
- OpenAI > 视频接口 [下载视频文件](https://apiai.apifox.cn/api-358250948.md): 已在查询任务接口进行视频转存，查询接口有video_url的话不建议再使用本接口获取文件

> 更新时间：2026-01-13

本目录包含 ephone 中转站支持的 API 文档。

## 目录结构

| 文件 | 说明 | 集成状态 |
|-----|------|---------|
| [openai-video.md](./openai-video.md) | OpenAI Video 格式（Sora） | ✅ 已集成 |

## 格式说明

### OpenAI Video 格式

使用 OpenAI 兼容的视频生成接口：
- 创建视频：`POST /v1/videos`（multipart/form-data）
- 查询状态：`GET /v1/videos/{video_id}`
- 下载视频：`GET /v1/videos/{video_id}/content`（可选，查询接口已返回 video_url）

支持模型：sora-2, sora-2-pro

# aabao 中转站 API 文档

> 来源：https://apifox.newapi.ai/383844578e0
> 来源：https://apifox.newapi.ai/llms.txt
- 根目录 > 视频（Videos） > Sora格式 [创建视频 ](https://apifox.newapi.ai/383844578e0.md): OpenAI 兼容的视频生成接口。
- 根目录 > 视频（Videos） > Sora格式 [获取视频任务状态 ](https://apifox.newapi.ai/383844579e0.md): OpenAI 兼容的视频任务状态查询接口。
- 根目录 > 视频（Videos） > Sora格式 [获取视频内容](https://apifox.newapi.ai/383844580e0.md): 获取已完成视频任务的视频文件内容。

> 更新时间：2026-01-13

本目录包含 aabao 中转站（NewAPI 格式）支持的 API 文档。

## 目录结构

| 文件 | 说明 | 集成状态 |
|-----|------|---------|
| [sora.md](./sora.md) | Sora 格式（OpenAI 兼容） | ⏳ 待集成 |

## 格式说明

### Sora 格式

使用 OpenAI 兼容的视频生成接口：
- 创建视频：`POST /v1/videos`（multipart/form-data）
- 查询状态：`GET /v1/videos/{task_id}`
- 获取内容：`GET /v1/videos/{task_id}/content`

与云雾的视频统一格式不同，Sora 格式：
- 使用 `multipart/form-data` 而非 JSON
- 参考图通过文件上传而非 URL
- 视频内容通过专用端点获取而非返回 URL

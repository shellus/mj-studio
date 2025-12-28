# Luma 视频生成 API

> 来源：云雾 API
>
> 官方文档：https://docs.lumalabs.ai/docs/video-generation
>
> 集成状态：❌ 未集成

## 接口列表

| 操作 | 端点 | 方法 |
|-----|------|-----|
| 提交生成视频任务 | `/dream-machine/v1/generations` | POST |
| 扩展视频 | `/dream-machine/v1/generations/{id}/extend` | POST |
| 查询单个任务 | `/dream-machine/v1/generations/{id}` | GET |
| 批量获取任务 | `/dream-machine/v1/generations` | GET |

## 状态码

```go
// Luma 任务状态
// "pending", "processing", "completed", "failed"
```

## 参考链接

- 创建视频：https://yunwu.apifox.cn/api-247110323.md
- 扩展视频：https://yunwu.apifox.cn/api-247123616.md
- 查询任务：https://yunwu.apifox.cn/api-247123648.md
- 状态码：https://yunwu.apifox.cn/doc-7391970.md

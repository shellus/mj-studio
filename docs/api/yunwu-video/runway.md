# Runway 视频生成 API

> 来源：云雾 API
>
> 官方文档：https://docs.dev.runwayml.com/api/
>
> 集成状态：❌ 未集成

## 接口列表

| 操作 | 端点 | 方法 |
|-----|------|-----|
| 提交视频生成任务 | `/v1/image_to_video` | POST |
| 查询视频任务 | `/v1/tasks/{id}` | GET |

## 状态码

```go
// Runway 任务请求状态
const (
    TaskRequestStatusSubmitted = "submitted"
    TaskRequestStatusError     = "error"
    TaskRequestStatusFailed    = "failed"
)
```

## 参考链接

- 创建视频：https://yunwu.apifox.cn/api-247132317.md
- 查询任务：https://yunwu.apifox.cn/api-247132320.md
- 状态码：https://yunwu.apifox.cn/doc-7391957.md

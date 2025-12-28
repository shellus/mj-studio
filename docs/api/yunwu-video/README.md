# 云雾中转站视频 API 文档

> 来源：https://yunwu.apifox.cn/llms.txt
>
> 更新时间：2025-12-28

本目录包含云雾中转站支持的所有视频生成 API 文档。

## 目录结构

| 文件 | 说明 | 集成状态 |
|-----|------|---------|
| [video-unified.md](./video-unified.md) | 视频统一格式（Veo、即梦、Sora、Grok） | ✅ 已集成 |
| [luma.md](./luma.md) | Luma 官方格式 | ❌ 未集成 |
| [runway.md](./runway.md) | Runway 格式 | ❌ 未集成 |
| [hailuo.md](./hailuo.md) | 海螺（MiniMax）格式 | ❌ 未集成 |
| [doubao-video.md](./doubao-video.md) | 豆包视频格式 | ❌ 未集成 |
| [kling.md](./kling.md) | 可灵（Kling）格式 | ❌ 未集成 |
| [tongyi-wanxiang.md](./tongyi-wanxiang.md) | 通义万象格式 | ❌ 未集成 |

## 格式分类

### 视频统一格式（已集成）

使用统一的 `/v1/video/create` 和 `/v1/video/query` 端点，支持多个模型：
- Veo（Google）
- 即梦（Jimeng）
- Sora（OpenAI）
- Grok Video（xAI）

### 独立格式（待集成）

每个模型有自己独特的 API 格式：
- Luma：官方 API 格式
- Runway：官方 API 格式
- 海螺：MiniMax 官方格式
- 豆包视频：火山引擎格式
- 可灵：快手官方格式
- 通义万象：阿里云格式

## 集成优先级建议

1. **优先集成**：视频统一格式已覆盖主流模型
2. **按需集成**：根据用户需求评估是否集成独立格式
3. **考虑因素**：模型质量、价格、中文支持、API 稳定性

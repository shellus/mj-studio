# 云雾中转站 API 文档

> 来源：https://yunwu.apifox.cn/llms.txt
>
> 更新时间：2026-01-13

本目录包含云雾中转站支持的 API 文档。

## 图片模型

| 文件 | 说明 | 集成状态 |
|-----|------|---------|
| [dall-e-3.md](./dall-e-3.md) | DALL-E 3 | ✅ 已集成 |
| [flux.md](./flux.md) | FLUX | ✅ 已集成 |
| [doubao-image.md](./doubao-image.md) | 豆包绘图 | ✅ 已集成 |
| [gpt-image-1-create.md](./gpt-image-1-create.md) | GPT Image 创建 | ✅ 已集成 |
| [gpt-image-1-edit.md](./gpt-image-1-edit.md) | GPT Image 编辑 | ✅ 已集成 |

## 视频模型

| 文件 | 说明 | 集成状态 |
|-----|------|---------|
| [video-unified.md](./video-unified.md) | 视频统一格式（Veo、即梦、Grok Video） | ✅ 已集成 |
| [luma.md](./luma.md) | Luma | ❌ 未集成 |
| [runway.md](./runway.md) | Runway | ❌ 未集成 |
| [hailuo.md](./hailuo.md) | 海螺（MiniMax） | ❌ 未集成 |
| [doubao-video.md](./doubao-video.md) | 豆包视频 | ❌ 未集成 |
| [kling.md](./kling.md) | 可灵 | ❌ 未集成 |
| [tongyi-wanxiang.md](./tongyi-wanxiang.md) | 通义万象 | ❌ 未集成 |

## 图片模型参数对比

| 参数 | GPT Image | DALL-E 3 | FLUX | 豆包 |
|-----|----------|---------|------|-----|
| `size` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` | `1024x1024`, `1792x1024`, `1024x1792` | `256x256`, `512x512`, `1024x1024` | 见文档 |
| `aspect_ratio` | - | - | `21:9` ~ `9:21` | - |
| `quality` | `high`, `medium`, `low` | `hd`, `standard` | `hd` | - |
| `style` | - | `vivid`, `natural` | - | - |
| `seed` | - | - | - | `-1` ~ `2147483647` |
| `negative_prompt` | - | - | 支持 | - |

## 参考链接

- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)
- [火山引擎豆包文档](https://www.volcengine.com/docs/82379/1541523)

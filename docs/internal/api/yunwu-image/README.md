# 云雾图片模型 API 文档

本目录包含云雾 API 中各图片生成模型的接口文档。

## 模型列表

| 模型类型 | 文档 | API 格式 | 备注 |
|---------|-----|---------|-----|
| GPT Image (gpt-image-1) | [gpt-image-1-create.md](gpt-image-1-create.md), [gpt-image-1-edit.md](gpt-image-1-edit.md) | DALL-E | 支持文生图和图生图 |
| DALL-E 3 | [dall-e-3.md](dall-e-3.md) | DALL-E | 仅支持文生图 |
| FLUX | [flux.md](flux.md) | DALL-E | 支持文生图和图生图（multipart/form-data） |
| 豆包 (doubao-seedream) | [doubao.md](doubao.md) | DALL-E | 中文理解能力强 |

## 参数对比

| 参数 | GPT Image | DALL-E 3 | FLUX | 豆包 |
|-----|----------|---------|------|-----|
| `size` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` | `1024x1024`, `1792x1024`, `1024x1792` | `256x256`, `512x512`, `1024x1024` | 见推荐尺寸 |
| `aspect_ratio` | - | - | `21:9`, `16:9`, `4:3`, `3:2`, `1:1`, `2:3`, `3:4`, `9:16`, `9:21` | - |
| `quality` | `high`, `medium`, `low` | `hd`, `standard` | `hd` | - |
| `style` | - | `vivid`, `natural` | - | - |
| `seed` | - | - | - | `-1` ~ `2147483647` |
| `guidance_scale` | - | - | - | `1` ~ `10` (默认 2.5) |
| `watermark` | - | - | - | `true`/`false` |
| `n` | `1-10` | `1-10` | `1-10` | - |
| `negative_prompt` | - | - | 支持 | - |
| `background` | `transparent`, `opaque`, `auto` | - | `transparent`, `opaque`, `auto` | - |
| `moderation` | `low`, `auto` | - | `low`, `auto` | - |

## 参考链接

- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)
- [火山引擎豆包文档](https://www.volcengine.com/docs/82379/1541523)

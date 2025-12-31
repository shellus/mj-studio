# 帮助中心

<details open>
<summary><strong>各个绘图模型有什么特点？</strong></summary>


**抠抠图** - 不是 AI 大模型，而是本站适配的专用图像处理 API，用于移除图片背景，与 GPT-4o 绘图不同，不会改变图像内容

**Midjourney** - 使用特殊 API 格式，参数在提示词中提供（如 `--v 6`、`--ar 16:9`），支持 U/V 操作和图片混合

**不支持垫图** - DALL-E、Z-Image 不支持参考图/垫图功能

**支持对话生图** - GPT-4o 绘图、GPT Image、Sora 绘图、Grok 绘图、通义万相、Gemini 绘图，这些模型使用 OpenAI Chat 格式，也可以在对话页面中生成图片

**支持负面提示词** - Flux、豆包、Z-Image 支持负面提示词参数

**Z-Image** - 完全无审查，支持 NSFW 内容生成

</details>

<details>
<summary><strong>什么模型支持输出透明通道/移除背景？</strong></summary>


目前支持透明背景的模型：

- **GPT-4o 绘图** - 支持 `background` 参数设为 `transparent`，可直接生成透明背景图片，该模型会一定程度改变图像内容
- **抠抠图** - 专用图像处理 API，上传任意图片即可获得透明背景版本，不需要输入提示词，不会改变图像内容

其他模型暂不支持直接输出透明背景，如需透明背景建议先生成后使用抠抠图处理。

</details>

<details>
<summary><strong>可以使用哪些 API？</strong></summary>


本系统支持以下 API 格式，只要上游服务商兼容这些格式即可接入（官方或第三方均可）：

| API 格式 | 说明 | 适用模型 |
|---------|------|---------|
| **MJ-Proxy** | 兼容 midjourney-proxy 项目的 API | Midjourney |
| **DALL-E API** | OpenAI 图像生成 API 格式 | DALL-E、Flux、豆包、Z-Image |
| **OpenAI Chat** | OpenAI Chat Completions 格式 | GPT-4o 绘图、GPT Image、Sora 绘图、Grok 绘图、通义万相 |
| **Gemini API** | Google Gemini 原生 API | Gemini 绘图 |
| **抠抠图 API** | 专用抠图服务 API | 抠抠图 |
| **视频统一格式** | 统一的视频生成 API | 即梦、Veo、Sora 视频、Grok 视频 |

配置上游时，API 地址无需添加 `/v1` 后缀，系统会根据不同接口自动拼接正确的路径。

</details>

<details open>
<summary><strong>图片生成模型一览</strong></summary>


| 模型 | 说明 |
|-----|------|
| **Midjourney** | 支持 U/V 操作、图片混合、垫图等完整功能 |
| **Gemini 绘图** | 支持多轮对话式图像编辑，垫图效果较好 |
| **Flux** | 仅 flux-kontext-{max, pro} 支持垫图 |
| **DALL-E** | DALL-E 3 API 不支持垫图功能 |
| **豆包绘图** | 字节跳动图像生成模型，中文理解能力强 |
| **GPT-4o 绘图** | 基于 GPT-4o 的图像生成，支持复杂指令 |
| **GPT Image** | GPT Image 系列，质量高，指令跟随能力强 |
| **Sora 绘图** | Sora 图像生成，OpenAI 视频模型的图像版本 |
| **Grok 绘图** | xAI 图像生成模型，风格多样，响应快速 |
| **通义万相** | 阿里通义万相，中文提示词效果好 |
| **Z-Image** | 完全无审查，支持 NSFW 内容生成 |
| **抠抠图** | 专用图像处理 API（非 AI 大模型），自动移除图片背景 |

</details>

<details open>
<summary><strong>视频生成模型一览</strong></summary>


| 模型 | 说明 |
|-----|------|
| **即梦视频** | 字节即梦视频生成，支持文生视频和图生视频，支持宽高比、分辨率参数 |
| **Veo** | Google Veo 视频生成，支持首帧/尾帧参考图，支持提示词增强和超分辨率参数 |
| **Sora 视频** | OpenAI Sora 视频生成，审查严格，不支持任何包含人像的内容，支持方向、分辨率、时长参数 |
| **Grok 视频** | xAI Grok 视频生成，响应快速，支持宽高比参数 |

</details>

# FLUX 系列

## 概述
FLUX 系列模型支持文生图和图生图。

## 文生图（OpenAI 兼容格式）

- **端点**: `POST /v1/images/generations`
- **格式**: `application/json`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `model` | string | 是 | 模型 ID，如 `flux-kontext-pro`、`flux-kontext-max` |
| `prompt` | string | 是 | 所需图像的文本描述。最大长度为 1000 个字符 |
| `n` | integer | 否 | 要生成的图像数。必须介于 1 和 10 之间 |
| `aspect_ratio` | string | 是 | 图片比例：`21:9`、`16:9`、`4:3`、`3:2`、`1:1`、`2:3`、`3:4`、`9:16`、`9:21` |
| `size` | string | 否 | 生成图像的大小：`256x256`、`512x512`、`1024x1024` |
| `quality` | string | 否 | 图像质量：`hd` 创建具有更精细细节和更高一致性的图像 |
| `style` | string | 否 | 风格 |
| `response_format` | string | 否 | 返回格式：`url` 或 `b64_json` |

### 请求示例

```json
{
  "model": "flux-kontext-pro",
  "prompt": "a beautiful landscape with a river and mountains",
  "n": 1,
  "aspect_ratio": "21:9"
}
```

## 图生图/编辑（OpenAI 兼容格式）

- **端点**: `POST /v1/images/edits`
- **格式**: `multipart/form-data`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `image` | file | 是 | 要编辑的图片。png、webp 或 jpg 文件，小于 25MB |
| `prompt` | string | 是 | 所需图像的文本描述 |
| `model` | string | 否 | 模型 ID：`flux-kontext-pro`、`flux-kontext-max` |
| `n` | string | 否 | 要生成的图像数量。必须介于 1 到 10 之间 |
| `aspect_ratio` | string | 否 | 图片比例：`21:9`、`16:9`、`4:3`、`3:2`、`1:1`、`2:3`、`3:4`、`9:16`、`9:21` |
| `quality` | string | 否 | 生成图像的质量：`high`、`medium`、`low` |
| `mask` | string | 否 | 遮罩图片 |
| `background` | string | 否 | 背景透明度：`transparent`、`opaque`、`auto` |
| `moderation` | string | 否 | 内容审核级别：`low` 或 `auto` |
| `response_format` | string | 否 | 返回格式：`url` 或 `b64_json` |

### 请求示例

```
POST /v1/images/edits
Content-Type: multipart/form-data

image: [二进制文件]
prompt: 换成红色衣服
model: flux-kontext-max
n: 1
aspect_ratio: 16:9
```

## 响应格式

```json
{
  "created": 1677652288,
  "data": [
    {
      "url": "https://..."
    }
  ]
}
```

## 支持的模型
- `flux-kontext-pro`
- `flux-kontext-max`

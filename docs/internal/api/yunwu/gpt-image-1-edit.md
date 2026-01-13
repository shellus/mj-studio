# 编辑 gpt-image-1

## 概述
给定参考图片和提示，该模型将返回编辑后的图像。

- **端点**: `POST /v1/images/edits`
- **格式**: `multipart/form-data`

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `image` | file | 是 | 要编辑的图片。每张图片应为小于 25MB 的 png、webp 或 jpg 文件 |
| `prompt` | string | 是 | 所需图像的文本描述。最大长度为 32000 个字符 |
| `model` | string | 否 | 模型 ID：`gpt-image-1`、`gpt-image-1-all`、`flux-kontext-pro`、`flux-kontext-max` |
| `n` | string | 否 | 要生成的图像数量。必须介于 1 到 10 之间 |
| `size` | string | 否 | 生成图像的尺寸：`1024x1024`、`1536x1024`（横版）、`1024x1536`（竖版）或 `auto`（默认值） |
| `quality` | string | 否 | 生成图像的质量：`high`、`medium`、`low`。默认为 `auto` |
| `mask` | string | 否 | 遮罩图片，透明区域指示应编辑的位置。必须是有效的 PNG 文件 |
| `background` | string | 否 | 背景透明度：`transparent`（透明）、`opaque`（不透明）或 `auto`（默认值） |
| `moderation` | string | 否 | 内容审核级别：`low`（限制较少）或 `auto`（默认值） |
| `response_format` | string | 否 | 返回格式：`url` 或 `b64_json`。gpt-image-1 始终返回 base64 |

## 请求示例

```
POST /v1/images/edits
Content-Type: multipart/form-data

image: [二进制文件]
prompt: 将他们合并在一个图片里面
model: gpt-image-1
n: 1
size: 1024x1536
background: transparent
moderation: low
```

## 响应格式

```json
{
  "created": 1677652288,
  "data": [
    {
      "b64_json": "iVBORw0KGgo..."
    }
  ]
}
```

## 官方文档
- https://platform.openai.com/docs/api-reference/images/createEdit

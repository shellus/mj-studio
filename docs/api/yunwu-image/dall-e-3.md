# DALL·E 3

## 概述
给定提示和/或输入图像，模型将生成新图像。

- **端点**: `POST /v1/images/generations`
- **格式**: `application/json`

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `model` | string | 是 | 模型 ID，如 `dall-e-3` |
| `prompt` | string | 是 | 所需图像的文本描述。最大长度为 1000 个字符 |
| `n` | integer | 否 | 要生成的图像数。必须介于 1 和 10 之间 |
| `size` | string | 否 | 生成图像的大小：`1024x1024`、`1792x1024`、`1024x1792` |
| `quality` | string | 否 | 图像质量：`hd`（更精细细节和更高一致性）或 `standard` |
| `style` | string | 否 | 生成图像的风格：`vivid`（超现实和戏剧性）或 `natural`（更自然） |
| `response_format` | string | 否 | 返回格式：`url` 或 `b64_json` |
| `user` | string | 否 | 唯一的最终用户标识符 |

## 请求示例

```json
{
  "model": "dall-e-3",
  "prompt": "A cute baby sea otter",
  "n": 1,
  "size": "1024x1024",
  "quality": "hd",
  "style": "vivid"
}
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

## 官方文档
- https://platform.openai.com/docs/api-reference/images
- https://platform.openai.com/docs/guides/images

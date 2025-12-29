# 创建 gpt-image-1

## 概述
给定一个提示，该模型将返回一个或多个预测的完成。

- **端点**: `POST /v1/images/generations`
- **格式**: `application/json`

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `model` | string | 是 | 模型 ID，如 `gpt-image-1` |
| `prompt` | string | 是 | 所需图像的文本描述。最大长度为 1000 个字符 |
| `n` | integer | 是 | 要生成的图像数。必须介于 1 和 10 之间 |
| `size` | string | 是 | 生成图像的尺寸。GPT 图像模型支持：`1024x1024`、`1536x1024`（横版）、`1024x1536`（竖版）或 `auto`（默认值） |

## 请求示例

```json
{
  "model": "gpt-image-1",
  "prompt": "一只可爱的小猪",
  "n": 1,
  "size": "1024x1536"
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
- https://platform.openai.com/docs/api-reference/images/create

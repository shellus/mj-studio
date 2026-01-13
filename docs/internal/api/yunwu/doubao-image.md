# 豆包系列（doubao-seedream）

## 概述
豆包系列图像生成模型，基于火山引擎。

- **端点**: `POST /v1/images/generations`
- **格式**: `application/json`

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|-----|
| `model` | string | 是 | 模型 ID，如 `doubao-seedream-3-0-t2i-250415` |
| `prompt` | string | 是 | 用于生成图像的提示词 |
| `response_format` | string | 否 | 返回格式：`url`（默认，JPEG 图片链接）或 `b64_json`（Base64 编码） |
| `size` | string | 否 | 生成图像的宽高像素，介于 [512x512, 2048x2048] 之间。推荐尺寸见下方 |
| `seed` | integer | 否 | 随机数种子，取值范围 [-1, 2147483647]。默认 -1（自动生成） |
| `guidance_scale` | number | 否 | 模型输出与 prompt 的一致程度，值越大与提示词相关性越强。取值范围 [1, 10]，默认 2.5 |
| `watermark` | boolean | 否 | 是否添加水印。`true` 在右下角添加"AI生成"水印，默认 `true` |

### 推荐尺寸

| 尺寸 | 比例 |
|-----|-----|
| `1024x1024` | 1:1 |
| `864x1152` | 3:4 |
| `1152x864` | 4:3 |
| `1280x720` | 16:9 |
| `720x1280` | 9:16 |
| `832x1248` | 2:3 |
| `1248x832` | 3:2 |
| `1512x648` | 21:9 |

## 请求示例

```json
{
  "model": "doubao-seedream-3-0-t2i-250415",
  "prompt": "鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。",
  "response_format": "url",
  "size": "1024x1024",
  "seed": 12,
  "guidance_scale": 2.5,
  "watermark": true
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
- https://www.volcengine.com/docs/82379/1541523

## 支持的模型
- `doubao-seedream-3-0-t2i-250415`

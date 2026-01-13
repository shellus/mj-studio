# ephone Models API

## 接口信息

- **URL**: `https://api.ephone.chat/v1/models`
- **Method**: GET
- **认证**: Bearer Token（需要 API Key）

## 请求头

```
Authorization: Bearer sk-xxxxx
```

## 响应结构

```typescript
interface ModelsResponse {
  data: Model[]
}

interface Model {
  id: string              // 模型标识符，如 "gpt-4o", "claude-3-opus"
  object: "model"         // 固定值
  created: number         // Unix 时间戳
  owned_by: string        // 厂商标识
  supported_endpoint_types: string[]  // 支持的端点类型（通常为空数组）
}
```

## owned_by 厂商列表

| 厂商标识 | 说明 |
|---------|------|
| openai | OpenAI |
| ali | 阿里（通义千问） |
| baidu | 百度（文心一言） |
| coze | 字节 Coze |
| custom | 自定义/第三方 |
| deepseek | DeepSeek |
| flux | Flux 绘图 |
| kling | 快影 |
| lingyiwanwu | 零一万物 |
| luma | Luma AI |
| midjourney | Midjourney |
| minimax | MiniMax |
| moonshot | 月之暗面 |
| perplexity | Perplexity |
| runway | Runway |
| submodel | 子模型 |
| suno | Suno 音乐 |
| tencent | 腾讯（混元） |
| vertex-ai | Google Vertex AI |
| volcengine | 火山引擎（豆包） |
| xai | xAI（Grok） |
| xunfei | 讯飞 |
| zhipu | 智谱 |
| zhipu_4v | 智谱视觉 |

## 模型数量

当前返回约 669 个模型。

## 使用示例

```bash
curl -X GET 'https://api.ephone.chat/v1/models' \
  -H 'Authorization: Bearer sk-xxxxx'
```

# 上游 API 文档

本目录存放各中转站的 API 文档，供开发时参考。

## 背景

国内 AI 中转站大多基于 [NewAPI](https://github.com/Calcium-Ion/new-api) 搭建或二次开发。NewAPI 是从 OneAPI fork 而来（OneAPI 已停止维护）。

因此不同中转站的 API 格式高度相似，但仍存在细微差异，需分别记录。

## 目录结构

```
docs/internal/api/
├── {中转站名}/
│   ├── README.md      # 中转站概述、文档来源、目录索引
│   ├── {api格式}.md   # 具体 API 文档
│   └── ...
└── README.md          # 本文件
```

## 中转站列表

| 目录 | 中转站 | 文档来源 |
|-----|-------|---------|
| [yunwu/](./yunwu/) | 云雾 | https://yunwu.apifox.cn/llms.txt |
| [ephone/](./ephone/) | ephone | https://apiai.apifox.cn/ |
| [aabao/](./aabao/) | aabao | https://apifox.newapi.ai/llms.txt |

## 文档采集原则

1. **来源追溯**：每个文档必须在头部注明来源 URL
2. **细节完整**：记录所有参数、枚举值、状态码，不可省略
3. **实测补充**：上游文档缺失但实测发现的内容，标注"实测补充"
4. **差异对比**：同类 API 在不同中转站的差异，应在文档末尾对比

## 设计决策

API 格式和模型类型的归并/拆分决策，记录在 [docs/dev-spec/上游服务接口设计.md](../dev-spec/上游服务接口设计.md)。

## 与代码的关系

```
API 文档                    代码实现
─────────────────────────────────────────────────
{中转站}/{api格式}.md  →  server/services/providers/{provider}.ts
                          ├── meta.apiFormat      # API 格式标识
                          ├── meta.capabilities   # 参数能力
                          └── createService()     # 请求实现

app/shared/types.ts
├── ApiFormat              # 所有 API 格式枚举
├── VideoModelType         # 视频模型类型
├── SoraVideoParams        # Sora 专用参数
└── ...
```

### 开发流程

1. 从中转站获取 API 文档，记录到 `docs/internal/api/{中转站}/`
2. 在 `app/shared/types.ts` 添加 `ApiFormat` 枚举值（如需要）
3. 在 `server/services/providers/` 实现 Provider
4. 在 `app/shared/registry.ts` 注册 Provider 元数据

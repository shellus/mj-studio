# 多Key支持与AI优化功能 - 详细实现计划

## 一、需求澄清

| 功能 | 说明 |
|-----|------|
| AI优化提示词 | 绘图页面添加按钮，调用对话模型优化提示词 |
| 嵌入式绘画默认值 | 设置页配置默认上游/模型，组件传参可覆盖 |
| 多Key支持 | 每个上游可配置多个Key，每个模型指定使用哪个Key |
| 余额查询 | 根据上游域名匹配调用不同中转站的余额API |

## 二、数据结构设计

### 2.1 新增类型定义

文件：`app/shared/types.ts`

```typescript
/** API Key 配置 */
export interface ApiKeyConfig {
  name: string           // Key名称："default", "premium", "backup"
  key: string            // API Key 值
  balanceApiType?: BalanceApiType  // 余额查询API类型
}

/** 余额查询API类型 */
export type BalanceApiType = 'oneapi' | 'n1n' | 'yunwu' | null
```

### 2.2 ModelTypeConfig 扩展

文件：`app/shared/types.ts`

```typescript
export interface ModelTypeConfig {
  category?: ModelCategory
  modelType: ModelType
  apiFormat: ApiFormat
  modelName: string
  estimatedTime?: number
  keyName?: string       // 新增：使用的Key名称，默认"default"
}
```

### 2.3 用户设置扩展

文件：`app/shared/constants.ts`

```typescript
export const USER_SETTING_KEYS = {
  // ... 现有设置 ...

  // 绘图设置（新增）
  DRAWING_AI_OPTIMIZE_CONFIG_ID: 'drawing.aiOptimizeConfigId',
  DRAWING_AI_OPTIMIZE_MODEL_NAME: 'drawing.aiOptimizeModelName',
  DRAWING_EMBEDDED_CONFIG_ID: 'drawing.embeddedConfigId',
  DRAWING_EMBEDDED_MODEL_TYPE: 'drawing.embeddedModelType',
} as const
```

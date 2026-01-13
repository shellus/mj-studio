# 模型图标资源

本目录包含 AI 模型的图标资源，用于在 UI 中显示模型的品牌标识。

## 文件格式

- **PNG** - 大多数图标（如 `claude.png`）
- **SVG** - 矢量图标（如 `byte_dance.svg`）
- **WebP** - 压缩格式（如 `bge.webp`）
- **JPEG** - 少量（如 `chatgpt.jpeg`）

## 命名规则

- `xxx.png` - 亮色主题图标
- `xxx_dark.png` - 暗色主题图标（可选）

## 从模型ID推断图标

通过正则表达式匹配模型ID来确定使用哪个图标。匹配规则按顺序遍历，返回第一个匹配的图标。

### 匹配规则表

| 正则模式 | 图标文件 | 匹配示例 |
|---------|---------|---------|
| `pixtral` | pixtral.png | pixtral-12b, pixtral-large |
| `jina` | jina.png | jina-embeddings-v3, jina-clip-v2 |
| `abab` | minimax.png | abab6.5s-chat |
| `minimax` | minimax.png | minimax-m2, MiniMax-M1 |
| `o1` | gpt_o1.png | o1-preview, o1-mini |
| `o3` | gpt_o1.png | o3, o3-mini |
| `o4` | gpt_o1.png | o4-mini |
| `gpt-image` | gpt_image_1.png | gpt-image-1 |
| `gpt-3` | gpt_3.5.png | gpt-3.5-turbo |
| `gpt-4` | gpt_4.png | gpt-4, gpt-4-turbo, gpt-4o |
| `gpt-5-mini` | gpt-5-mini.png | gpt-5-mini |
| `gpt-5-nano` | gpt-5-nano.png | gpt-5-nano |
| `gpt-5-chat` | gpt-5-chat.png | gpt-5-chat |
| `gpt-5-codex` | gpt-5-codex.png | gpt-5-codex |
| `gpt-5.1-codex-mini` | gpt-5.1-codex-mini.png | gpt-5.1-codex-mini |
| `gpt-5.1-codex` | gpt-5.1-codex.png | gpt-5.1-codex |
| `gpt-5.1-chat` | gpt-5.1-chat.png | gpt-5.1-chat |
| `gpt-5.1` | gpt-5.1.png | gpt-5.1 |
| `gpt-5` | gpt-5.png | gpt-5 |
| `glm` | chatglm.png | glm-4, glm-4.5-flash |
| `deepseek` | deepseek.png | deepseek-chat, deepseek-r1 |
| `(qwen\|qwq\|qvq\|wan-)` | qwen.png | qwen-max, qwq-32b, qvq-72b |
| `gemma` | gemma.png | gemma-2-27b |
| `yi-` | yi.png | yi-lightning, yi-vision |
| `llama` | llama.png | llama-3.1-70b, llama-4 |
| `mixtral` | mixtral.png | mixtral-8x7b |
| `mistral` | mixtral.png | mistral-large, mistral-7b |
| `codestral` | codestral.png | codestral-latest |
| `ministral` | mixtral.png | ministral-3b |
| `magistral` | mixtral.png | magistral |
| `moonshot` | moonshot.png | moonshot-v1-auto |
| `kimi` | moonshot.png | kimi-k2-0711 |
| `phi` | microsoft.png | phi-3, phi-4 |
| `baichuan` | baichuan.png | Baichuan4, Baichuan-M2 |
| `(claude\|anthropic-)` | claude.png | claude-3-opus, claude-sonnet-4 |
| `gemini` | gemini.png | gemini-2.5-pro, gemini-3-flash |
| `bison` | palm.png | text-bison |
| `palm` | palm.png | palm-2 |
| `step` | step.png | step-1-8k |
| `hailuo` | hailuo.png | hailuo |
| `doubao` | doubao.png | doubao-pro, doubao-seed-1.6 |
| `seedream` | doubao.png | seedream |
| `cohere` | cohere.png | cohere |
| `command` | cohere.png | command-r-plus |
| `minicpm` | minicpm.webp | minicpm-v |
| `360` | 360.png | 360gpt |
| `codegeex` | codegeex.png | codegeex-4 |
| `copilot` | copilot.png | copilot |
| `dalle` | dalle.png | dall-e-3 |
| `dall-e` | dalle.png | dall-e-2 |
| `flux` | flux.png | flux-1-dev |
| `grok` | grok.png | grok-3, grok-4 |
| `hunyuan` | hunyuan.png | hunyuan-pro, hunyuan-t1 |
| `internlm` | internlm.png | internlm2 |
| `internvl` | internvl.png | internvl2 |
| `llava` | llava.png | llava-1.5 |
| `midjourney` | midjourney.png | midjourney |
| `mj-` | midjourney.png | mj-imagine |
| `ernie-` | wenxin.png | ernie-4.0, ernie-speed |
| `stable-` | stability.png | stable-diffusion |
| `sdxl` | stability.png | sdxl-turbo |
| `sparkdesk` | sparkdesk.png | sparkdesk-v3 |
| `hermes` | nousresearch.png | hermes-3 |
| `gryphe` | gryphe.png | mythomax |
| `mythomax` | gryphe.png | mythomax-l2 |
| `suno` | suno.png | suno-v3 |
| `chirp` | suno.png | chirp-v3 |
| `luma` | luma.png | luma-1.5 |
| `keling` | keling.png | keling |
| `vidu-` | vidu.png | vidu-1.5 |
| `ai21` | ai21.png | ai21 |
| `jamba-` | ai21.png | jamba-1.5 |
| `nvidia` | nvidia.png | nvidia |
| `hugging` | huggingface.png | huggingface |
| `perplexity` | perplexity.png | perplexity |
| `sonar` | perplexity.png | sonar-pro, sonar-reasoning |
| `bge-` | bge.webp | bge-m3, bge-large |
| `voyage-` | voyageai.png | voyage-3, voyage-code-3 |
| `embedding` | embedding.png | text-embedding-3-large |
| `cogview` | zhipu.png | cogview-3 |
| `zhipu` | zhipu.png | zhipu |
| `longcat` | longcat (from apps/) | longcat-flash |
| `bytedance` | byte_dance.svg | bytedance |
| `ling` | ling.png | ling, ring |
| `mimo` | mimo.svg | mimo-v2-flash |

### 特殊规则说明

1. **规则顺序很重要**：匹配时按顺序遍历，返回第一个命中的结果
   - 例如 `gpt-5.1-codex` 要放在 `gpt-5.1` 之前，否则会被错误匹配

2. **不区分大小写**：所有匹配都使用 `i` 标志（case-insensitive）

3. **优先匹配 id，其次匹配 name**：
   ```typescript
   getModelLogoById(model.id) ?? getModelLogoById(model.name)
   ```

## 未识别模型的处理

当模型ID无法匹配任何规则时：

1. **返回 `undefined`**：`getModelLogoById()` 函数返回 `undefined`

2. **UI 降级显示**：使用模型名称的首字母作为头像
   ```tsx
   <Avatar src={getModelLogoById(model.id)}>
     {model?.name?.[0]?.toUpperCase()}  {/* 首字母作为 fallback */}
   </Avatar>
   ```

3. **示例效果**：
   - 有图标：显示品牌 Logo（如 Claude 的紫色图标）
   - 无图标：显示首字母（如 "M" 代表 "my-custom-model"）

## 代码示例

### TypeScript 实现

```typescript
interface LogoMap {
  [pattern: string]: string  // 正则模式 -> 图片路径
}

const logoMap: LogoMap = {
  'deepseek': '/assets/models/deepseek.png',
  '(claude|anthropic-)': '/assets/models/claude.png',
  'gemini': '/assets/models/gemini.png',
  '(qwen|qwq|qvq)': '/assets/models/qwen.png',
  // ... 更多规则
}

export function getModelLogoById(modelId: string): string | undefined {
  if (!modelId) return undefined

  for (const pattern in logoMap) {
    const regex = new RegExp(pattern, 'i')
    if (regex.test(modelId)) {
      return logoMap[pattern]
    }
  }

  return undefined
}

export function getModelLogo(model: { id: string; name: string }): string | undefined {
  return getModelLogoById(model.id) ?? getModelLogoById(model.name)
}
```

### React 组件示例

```tsx
import { Avatar } from 'antd'

function ModelIcon({ model }: { model: { id: string; name: string } }) {
  const logo = getModelLogo(model)

  return (
    <Avatar src={logo} size={32}>
      {model.name?.[0]?.toUpperCase()}
    </Avatar>
  )
}
```

## 添加新图标

1. 将图标文件放入本目录（建议 PNG 格式，尺寸 64x64 或 128x128）
2. 在匹配规则表中添加对应的正则模式
3. 注意规则顺序，更具体的规则应放在前面

## 来源

这些图标资源来自 [Cherry Studio](https://github.com/kangfenmao/cherry-studio) 项目。

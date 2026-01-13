/**
 * 模型图标工具
 *
 * 根据模型 ID 匹配对应的图标文件
 * 规则参考：app/assets/models/README.md
 */

// 图标匹配规则（按顺序匹配，更具体的规则放前面）
const logoRules: [RegExp, string][] = [
  // MiniMax
  [/abab/i, 'minimax.png'],
  [/minimax/i, 'minimax.png'],

  // OpenAI 系列（顺序重要）
  [/pixtral/i, 'pixtral.png'],
  [/o1/i, 'gpt_o1.png'],
  [/o3/i, 'gpt_o1.png'],
  [/o4/i, 'gpt_o1.png'],
  [/gpt-image/i, 'gpt_image_1.png'],
  [/gpt-3/i, 'gpt_3.5.png'],
  [/gpt-5\.1-codex-mini/i, 'gpt-5.1-codex-mini.png'],
  [/gpt-5\.1-codex/i, 'gpt-5.1-codex.png'],
  [/gpt-5\.1-chat/i, 'gpt-5.1-chat.png'],
  [/gpt-5\.1/i, 'gpt-5.1.png'],
  [/gpt-5-mini/i, 'gpt-5-mini.png'],
  [/gpt-5-nano/i, 'gpt-5-nano.png'],
  [/gpt-5-chat/i, 'gpt-5-chat.png'],
  [/gpt-5-codex/i, 'gpt-5-codex.png'],
  [/gpt-5/i, 'gpt-5.png'],
  [/gpt-4/i, 'gpt_4.png'],

  // 其他厂商
  [/jina/i, 'jina.png'],
  [/glm/i, 'chatglm.png'],
  [/deepseek/i, 'deepseek.png'],
  [/(qwen|qwq|qvq|wan-)/i, 'qwen.png'],
  [/gemma/i, 'gemma.png'],
  [/yi-/i, 'yi.png'],
  [/llama/i, 'llama.png'],
  [/mixtral/i, 'mixtral.png'],
  [/mistral/i, 'mixtral.png'],
  [/codestral/i, 'codestral.png'],
  [/ministral/i, 'mixtral.png'],
  [/magistral/i, 'mixtral.png'],
  [/moonshot/i, 'moonshot.png'],
  [/kimi/i, 'moonshot.png'],
  [/phi/i, 'microsoft.png'],
  [/baichuan/i, 'baichuan.png'],
  [/(claude|anthropic-)/i, 'claude.png'],
  [/gemini/i, 'gemini.png'],
  [/bison/i, 'palm.png'],
  [/palm/i, 'palm.png'],
  [/step/i, 'step.png'],
  [/hailuo/i, 'hailuo.png'],
  [/doubao/i, 'doubao.png'],
  [/seedream/i, 'doubao.png'],
  [/cohere/i, 'cohere.png'],
  [/command/i, 'cohere.png'],
  [/minicpm/i, 'minicpm.webp'],
  [/360/i, '360.png'],
  [/codegeex/i, 'codegeex.png'],
  [/copilot/i, 'copilot.png'],
  [/dall-?e/i, 'dalle.png'],
  [/flux/i, 'flux.png'],
  [/grok/i, 'grok.png'],
  [/hunyuan/i, 'hunyuan.png'],
  [/internlm/i, 'internlm.png'],
  [/internvl/i, 'internvl.png'],
  [/llava/i, 'llava.png'],
  [/midjourney/i, 'midjourney.png'],
  [/mj-/i, 'midjourney.png'],
  [/ernie-/i, 'wenxin.png'],
  [/stable-/i, 'stability.png'],
  [/sdxl/i, 'stability.png'],
  [/sparkdesk/i, 'sparkdesk.png'],
  [/hermes/i, 'nousresearch.png'],
  [/gryphe/i, 'gryphe.png'],
  [/mythomax/i, 'gryphe.png'],
  [/suno/i, 'suno.png'],
  [/chirp/i, 'suno.png'],
  [/luma/i, 'luma.png'],
  [/keling/i, 'keling.png'],
  [/vidu-/i, 'vidu.png'],
  [/ai21/i, 'ai21.png'],
  [/jamba-/i, 'ai21.png'],
  [/nvidia/i, 'nvidia.png'],
  [/hugging/i, 'huggingface.png'],
  [/perplexity/i, 'perplexity.png'],
  [/sonar/i, 'perplexity.png'],
  [/bge-/i, 'bge.webp'],
  [/voyage-/i, 'voyageai.png'],
  [/embedding/i, 'embedding.png'],
  [/cogview/i, 'zhipu.png'],
  [/zhipu/i, 'zhipu.png'],
  [/bytedance/i, 'byte_dance.svg'],
  [/ling/i, 'ling.png'],
  [/mimo/i, 'mimo.svg'],
  [/veo/i, 'google.png'],
  [/sora/i, 'gpt_4.png'],
  [/jimeng/i, 'doubao.png'],
]

/**
 * 根据模型 ID 获取图标路径
 * @param modelId 模型 ID
 * @returns 图标路径，未匹配返回 undefined
 */
export function getModelLogoById(modelId: string): string | undefined {
  if (!modelId) return undefined

  for (const [pattern, filename] of logoRules) {
    if (pattern.test(modelId)) {
      return `/models/${filename}`
    }
  }

  return undefined
}

/**
 * 根据模型信息获取图标路径（优先匹配 modelName，其次匹配 name）
 */
export function getModelLogo(model: { id?: number; name?: string; modelName?: string }): string | undefined {
  return getModelLogoById(model.modelName || '') ||
         getModelLogoById(model.name || '')
}

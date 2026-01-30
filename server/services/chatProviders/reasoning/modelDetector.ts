/**
 * 模型类型检测工具
 *
 * 根据模型名称判断其支持的思考/推理参数格式
 */

/**
 * 检测是否为 OpenAI 推理模型（o1/o3/GPT-5 系列）
 */
export function isOpenAIReasoningModel(modelName: string): boolean {
  const patterns = [
    /^o1(-preview|-mini)?$/i,
    /^o3(-mini)?$/i,
    /^gpt-5/i,
  ]
  return patterns.some(pattern => pattern.test(modelName))
}

/**
 * 检测是否为 Claude 思考模型（3.7+/4.x 系列）
 */
export function isClaudeThinkingModel(modelName: string): boolean {
  const patterns = [
    /^claude-3\.7/i,
    /^claude-4/i,
  ]
  return patterns.some(pattern => pattern.test(modelName))
}

/**
 * 检测是否为 Gemini 3 系列（支持 reasoning_effort）
 */
export function isGemini3Model(modelName: string): boolean {
  return /^gemini-3/i.test(modelName)
}

/**
 * 检测是否为 Gemini 2.5 系列（支持 thinking_config）
 */
export function isGemini25Model(modelName: string): boolean {
  return /^gemini-2\.5/i.test(modelName)
}

/**
 * 检测是否为通义千问推理模型（QwQ 系列）
 */
export function isQwenReasoningModel(modelName: string): boolean {
  const patterns = [
    /^qwq/i,
    /^qwen.*-plus-latest$/i,
  ]
  return patterns.some(pattern => pattern.test(modelName))
}

/**
 * 检测是否为混元推理模型
 */
export function isHunyuanReasoningModel(modelName: string): boolean {
  return /^hunyuan.*-turbo-latest$/i.test(modelName)
}

/**
 * 检测是否为智谱 GLM 推理模型（GLM-4.7+ 系列）
 */
export function isZhipuReasoningModel(modelName: string): boolean {
  const patterns = [
    /^glm-4\.7/i,
    /^glm-4-plus/i,
  ]
  return patterns.some(pattern => pattern.test(modelName))
}

/**
 * 检测是否为豆包推理模型
 */
export function isDoubaoReasoningModel(modelName: string): boolean {
  return /^doubao.*-pro/i.test(modelName)
}

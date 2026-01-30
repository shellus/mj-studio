/**
 * 思考/推理模式参数类型定义
 */

/** 推理强度选项 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'auto'

/** OpenAI 推理参数格式 */
export interface OpenAIReasoningParams {
  reasoning_effort?: 'low' | 'medium' | 'high'
}

/** Claude 思考参数格式 */
export interface ClaudeThinkingParams {
  thinking?: {
    type: 'enabled' | 'disabled'
    budget_tokens?: number
  }
}

/** Gemini 思考参数格式（OpenAI 兼容 API） */
export interface GeminiThinkingParams {
  reasoning_effort?: 'low' | 'medium' | 'high'
  extra_body?: {
    google?: {
      thinking_config?: {
        thinking_budget?: number
        include_thoughts?: boolean
      }
    }
  }
}

/** 通义千问/混元思考参数格式 */
export interface QwenHunyuanThinkingParams {
  enable_thinking?: boolean
  thinking_budget?: number
}

/** 智谱/豆包思考参数格式 */
export interface ZhipuDoubaoThinkingParams {
  thinking?: {
    type: 'enabled' | 'disabled' | 'auto'
  }
}

/** 统一的思考参数类型 */
export type ThinkingParams =
  | OpenAIReasoningParams
  | ClaudeThinkingParams
  | GeminiThinkingParams
  | QwenHunyuanThinkingParams
  | ZhipuDoubaoThinkingParams
  | Record<string, unknown>

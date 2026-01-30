/**
 * 推理/思考参数构建器
 *
 * 根据模型类型和用户配置，构建对应的思考参数
 */

import type { ReasoningEffort, ThinkingParams } from './types'
import {
  isOpenAIReasoningModel,
  isClaudeThinkingModel,
  isGemini3Model,
  isGemini25Model,
  isQwenReasoningModel,
  isHunyuanReasoningModel,
  isZhipuReasoningModel,
  isDoubaoReasoningModel,
} from './modelDetector'

/**
 * 构建思考参数
 *
 * @param modelName - 模型名称
 * @param enableThinking - 是否启用思考模式
 * @param reasoningEffort - 推理强度（可选）
 * @returns 对应格式的思考参数对象
 */
export function buildReasoningParams(
  modelName: string,
  enableThinking: boolean,
  reasoningEffort?: ReasoningEffort
): ThinkingParams {
  // 如果未启用思考，返回关闭参数
  if (!enableThinking) {
    return buildDisabledParams(modelName)
  }

  // 如果启用思考，根据模型类型构建参数
  return buildEnabledParams(modelName, reasoningEffort)
}

/**
 * 构建关闭思考的参数
 */
function buildDisabledParams(modelName: string): ThinkingParams {
  // OpenAI 推理模型：不支持关闭（返回空对象）
  if (isOpenAIReasoningModel(modelName)) {
    return {}
  }

  // Claude 思考模型
  if (isClaudeThinkingModel(modelName)) {
    return {
      thinking: {
        type: 'disabled'
      }
    }
  }

  // 通义千问/混元
  if (isQwenReasoningModel(modelName) || isHunyuanReasoningModel(modelName)) {
    return {
      enable_thinking: false
    }
  }

  // 智谱 GLM（OpenAI 兼容 API）
  if (isZhipuReasoningModel(modelName)) {
    return {
      enable_thinking: false
    }
  }

  // 豆包
  if (isDoubaoReasoningModel(modelName)) {
    return {
      thinking: {
        type: 'disabled'
      }
    }
  }

  // Gemini 2.5 Flash（可以设置 budget 为 0）
  if (isGemini25Model(modelName) && modelName.includes('flash')) {
    return {
      extra_body: {
        google: {
          thinking_config: {
            thinking_budget: 0
          }
        }
      }
    }
  }

  // 其他模型：返回空对象
  return {}
}

/**
 * 构建启用思考的参数
 */
function buildEnabledParams(modelName: string, reasoningEffort?: ReasoningEffort): ThinkingParams {
  const effort = reasoningEffort || 'medium'

  // OpenAI 推理模型（o1/o3/GPT-5）
  if (isOpenAIReasoningModel(modelName)) {
    return {
      reasoning_effort: effort === 'auto' ? 'medium' : effort as 'low' | 'medium' | 'high'
    }
  }

  // Claude 思考模型
  if (isClaudeThinkingModel(modelName)) {
    return {
      thinking: {
        type: 'enabled',
        budget_tokens: getClaudeBudgetTokens(effort)
      }
    }
  }

  // Gemini 3 系列
  if (isGemini3Model(modelName)) {
    return {
      reasoning_effort: effort === 'auto' ? 'medium' : effort as 'low' | 'medium' | 'high'
    }
  }

  // Gemini 2.5 系列
  if (isGemini25Model(modelName)) {
    return {
      extra_body: {
        google: {
          thinking_config: {
            thinking_budget: -1,
            include_thoughts: true
          }
        }
      }
    }
  }

  // 通义千问推理模型
  if (isQwenReasoningModel(modelName)) {
    return {
      enable_thinking: true
    }
  }

  // 混元推理模型
  if (isHunyuanReasoningModel(modelName)) {
    return {
      enable_thinking: true
    }
  }

  // 智谱 GLM 推理模型（OpenAI 兼容 API）
  if (isZhipuReasoningModel(modelName)) {
    return {
      enable_thinking: true
    }
  }

  // 豆包推理模型
  if (isDoubaoReasoningModel(modelName)) {
    return {
      thinking: {
        type: 'enabled'
      }
    }
  }

  // 默认：不支持思考模式
  return {}
}

/**
 * 获取 Claude 的 budget_tokens
 * 根据推理强度返回不同的 token 预算
 */
function getClaudeBudgetTokens(effort: ReasoningEffort): number {
  const budgetMap: Record<string, number> = {
    low: 5000,
    medium: 10000,
    high: 20000,
    auto: 10000,
  }
  return budgetMap[effort] || 10000
}

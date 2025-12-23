// 对话开场白建议
import { useAuth } from './useAuth'

export function useConversationSuggestions() {
  const { getAuthHeader } = useAuth()

  // 按助手 ID 存储建议
  const suggestionsMap = useState<Record<number, string[]>>('conversation-suggestions', () => ({}))
  const loadingMap = useState<Record<number, boolean>>('conversation-suggestions-loading', () => ({}))

  // 获取指定助手的建议
  function getSuggestions(assistantId: number): string[] {
    return suggestionsMap.value[assistantId] || []
  }

  // 是否正在加载
  function isLoading(assistantId: number): boolean {
    return loadingMap.value[assistantId] || false
  }

  // 加载建议
  async function loadSuggestions(assistantId: number, refresh = false): Promise<void> {
    // 已有数据且非刷新，跳过
    if (!refresh && suggestionsMap.value[assistantId]?.length) {
      return
    }

    // 正在加载中，跳过
    if (loadingMap.value[assistantId]) {
      return
    }

    loadingMap.value[assistantId] = true

    try {
      const response = await $fetch<{ suggestions: string[] }>(
        `/api/assistants/${assistantId}/suggestions`,
        {
          method: 'POST',
          headers: getAuthHeader(),
          body: { refresh },
        }
      )

      suggestionsMap.value[assistantId] = response.suggestions
    } catch (error) {
      console.error('加载开场白建议失败:', error)
      // 失败不处理，保持空
    } finally {
      loadingMap.value[assistantId] = false
    }
  }

  // 刷新建议（换一批）
  async function refreshSuggestions(assistantId: number): Promise<void> {
    await loadSuggestions(assistantId, true)
  }

  return {
    getSuggestions,
    isLoading,
    loadSuggestions,
    refreshSuggestions,
  }
}

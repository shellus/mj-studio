// 用户设置 composable
import { useAuth } from './useAuth'
import {
  USER_SETTING_KEYS,
  USER_SETTING_DEFAULTS,
  type UserSettingKey,
  type UserSettingValue,
} from '../shared/constants'

export function useUserSettings() {
  const { getAuthHeader } = useAuth()

  // 设置数据
  const settings = useState<Record<UserSettingKey, UserSettingValue>>('user-settings', () => ({ ...USER_SETTING_DEFAULTS }))
  const isLoading = useState('user-settings-loading', () => false)
  const isLoaded = useState('user-settings-loaded', () => false)

  // 加载设置
  async function loadSettings(): Promise<void> {
    if (isLoading.value) return

    isLoading.value = true
    try {
      const data = await $fetch<Record<UserSettingKey, UserSettingValue>>('/api/settings', {
        headers: getAuthHeader(),
      })
      settings.value = data
      isLoaded.value = true
    } catch (error) {
      console.error('加载用户设置失败:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 更新设置
  async function updateSettings(updates: Partial<Record<UserSettingKey, UserSettingValue>>): Promise<void> {
    const data = await $fetch<Record<UserSettingKey, UserSettingValue>>('/api/settings', {
      method: 'PUT',
      headers: getAuthHeader(),
      body: updates,
    })
    settings.value = data
  }

  // 获取单个设置值
  function get<T extends UserSettingValue>(key: UserSettingKey): T {
    return settings.value[key] as T
  }

  // 恢复单个设置为默认值
  async function resetToDefault(key: UserSettingKey): Promise<void> {
    await updateSettings({ [key]: USER_SETTING_DEFAULTS[key] })
  }

  return {
    settings,
    isLoading,
    isLoaded,
    loadSettings,
    updateSettings,
    get,
    resetToDefault,
    USER_SETTING_KEYS,
    USER_SETTING_DEFAULTS,
  }
}

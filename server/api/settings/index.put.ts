// PUT /api/settings - 更新用户设置
import { useUserSettingsService } from '../../services/userSettings'
import { USER_SETTING_KEYS, type UserSettingKey, type UserSettingValue } from '../../../app/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: '请求体格式错误' })
  }

  // 验证键名
  const validKeys = Object.values(USER_SETTING_KEYS) as string[]
  const updates: Partial<Record<UserSettingKey, UserSettingValue>> = {}

  for (const [key, value] of Object.entries(body)) {
    if (validKeys.includes(key)) {
      updates[key as UserSettingKey] = value as UserSettingValue
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: '没有有效的设置项' })
  }

  const settingsService = useUserSettingsService()
  await settingsService.setMany(user.id, updates)

  // 返回更新后的所有设置
  const settings = await settingsService.getAll(user.id)
  return settings
})

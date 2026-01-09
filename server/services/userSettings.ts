// 用户设置服务
import { eq, and } from 'drizzle-orm'
import { db } from '../database'
import { userSettings } from '../database/schema'
import {
  USER_SETTING_KEYS,
  USER_SETTING_DEFAULTS,
  type UserSettingKey,
  type UserSettingValue,
} from '../../app/shared/constants'

export function useUserSettingsService() {
  /**
   * 获取用户的单个设置值
   */
  async function get<T extends UserSettingValue = string>(userId: number, key: UserSettingKey): Promise<T> {
    const [setting] = await db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
      .limit(1)

    if (setting) {
      return JSON.parse(setting.value) as T
    }

    return USER_SETTING_DEFAULTS[key] as T
  }

  /**
   * 获取用户的所有设置
   */
  async function getAll(userId: number): Promise<Record<UserSettingKey, UserSettingValue>> {
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))

    // 从默认值开始
    const result = { ...USER_SETTING_DEFAULTS } as Record<UserSettingKey, UserSettingValue>

    // 覆盖用户自定义值
    for (const setting of settings) {
      const key = setting.key as UserSettingKey
      if (key in USER_SETTING_DEFAULTS) {
        result[key] = JSON.parse(setting.value) as UserSettingValue
      }
    }

    return result
  }

  /**
   * 设置用户的单个设置值
   */
  async function set(userId: number, key: UserSettingKey, value: UserSettingValue): Promise<void> {
    const now = new Date()
    const jsonValue = JSON.stringify(value)

    // 尝试更新
    const updated = await db
      .update(userSettings)
      .set({ value: jsonValue, updatedAt: now })
      .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))

    // 如果没有更新到记录，则插入
    if (updated.changes === 0) {
      await db.insert(userSettings).values({
        userId,
        key,
        value: jsonValue,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  /**
   * 批量设置用户设置
   */
  async function setMany(userId: number, settings: Partial<Record<UserSettingKey, UserSettingValue>>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (key in USER_SETTING_DEFAULTS && value !== undefined) {
        await set(userId, key as UserSettingKey, value)
      }
    }
  }

  /**
   * 删除用户的单个设置（恢复默认）
   */
  async function remove(userId: number, key: UserSettingKey): Promise<void> {
    await db
      .delete(userSettings)
      .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
  }

  /**
   * 删除用户的所有设置（恢复所有默认）
   */
  async function removeAll(userId: number): Promise<void> {
    await db.delete(userSettings).where(eq(userSettings.userId, userId))
  }

  return {
    get,
    getAll,
    set,
    setMany,
    remove,
    removeAll,
  }
}

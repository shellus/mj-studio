/**
 * 统一的时间格式化 composable
 * - 3天内显示相对时间（刚刚、x分钟前、x小时前、昨天、前天）
 * - 3天后显示日期格式（YYYY-MM-DD）
 */

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

/**
 * 格式化为相对时间或日期
 */
export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 3天内显示相对时间
  if (diff < THREE_DAYS_MS) {
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

    const days = Math.floor(diff / 86400000)
    if (days === 1) return '昨天'
    if (days === 2) return '前天'
  }

  // 3天后显示日期
  return formatDate(dateStr)
}

/**
 * 格式化为日期（YYYY-MM-DD）
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化为完整日期时间（YYYY-MM-DD HH:mm:ss）
 */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 时间格式化 composable
 */
export function useTimeFormat() {
  return {
    formatTimeAgo,
    formatDate,
    formatDateTime,
  }
}

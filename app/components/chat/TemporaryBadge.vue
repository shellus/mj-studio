<script setup lang="ts">
const props = defineProps<{
  expiresAt: string  // ISO 8601 时间字符串
}>()

// 计算剩余时间
const timeRemaining = computed(() => {
  const now = new Date()
  const expires = new Date(props.expiresAt)
  const diff = expires.getTime() - now.getTime()

  if (diff <= 0) {
    return { text: '已过期', full: '对话已过期' }
  }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  // 短文本用于标签显示
  const text = hours > 0 ? `${hours}小时后删除` : `${minutes}分钟后删除`

  // 完整文本用于 tooltip
  const full = hours > 0
    ? `将在 ${hours}小时${minutes}分钟 后自动删除`
    : `将在 ${minutes}分钟 后自动删除`

  return { text, full }
})

// 每分钟更新一次（触发重新计算）
const refreshKey = ref(0)
let intervalId: NodeJS.Timeout | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    refreshKey.value++
  }, 60000)
})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})

// 监听 refreshKey 变化来触发 computed 重新计算
watch(refreshKey, () => {
  // 空函数，仅用于触发响应式更新
})
</script>

<template>
  <UTooltip :text="timeRemaining.full">
    <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
      <UIcon name="i-heroicons-clock" class="w-3 h-3" />
      <span>{{ timeRemaining.text }}</span>
    </span>
  </UTooltip>
</template>

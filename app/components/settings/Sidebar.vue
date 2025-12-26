<script setup lang="ts">
defineProps<{
  mobile?: boolean
}>()

const route = useRoute()

// 从父组件获取关闭抽屉的方法
const closeDrawer = inject<() => void>('closeSettingsDrawer', () => {})

const menuItems = [
  {
    label: '上游配置',
    icon: 'i-heroicons-cpu-chip',
    to: '/settings/upstreams',
  },
  {
    label: '导入/导出',
    icon: 'i-heroicons-arrow-path-rounded-square',
    to: '/settings/export',
  },
  {
    label: 'Prompt 设置',
    icon: 'i-heroicons-chat-bubble-bottom-center-text',
    to: '/settings/prompts',
  },
  {
    label: '通用设置',
    icon: 'i-heroicons-cog-6-tooth',
    to: '/settings/general',
  },
]

function isActive(to: string): boolean {
  return route.path.startsWith(to)
}

function handleClick() {
  closeDrawer()
}
</script>

<template>
  <nav class="w-48 shrink-0 space-y-1">
    <NuxtLink
      v-for="item in menuItems"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
      :class="isActive(item.to)
        ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
        : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)'"
      @click="mobile && handleClick()"
    >
      <UIcon :name="item.icon" class="w-5 h-5" />
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

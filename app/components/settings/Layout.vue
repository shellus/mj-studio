<script setup lang="ts">
// 移动端抽屉状态
const showDrawer = ref(false)

// 提供给子组件关闭抽屉的方法
provide('closeSettingsDrawer', () => {
  showDrawer.value = false
})
</script>

<template>
  <div class="p-4 lg:p-6">
    <!-- 页面标题 -->
    <div class="mb-4 lg:mb-6 flex items-center gap-3">
      <!-- 移动端菜单按钮 -->
      <UButton variant="ghost" size="sm" class="lg:hidden" @click="showDrawer = true">
        <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
      </UButton>
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-(--ui-text)">设置</h1>
        <p class="text-(--ui-text-muted) text-sm mt-1 hidden lg:block">管理你的 AI 服务配置</p>
      </div>
    </div>

    <!-- 布局：侧边栏 + 内容区 -->
    <div class="flex gap-6">
      <!-- 桌面端侧边栏 -->
      <SettingsSidebar class="hidden lg:block" />
      <div class="flex-1 min-w-0">
        <slot />
      </div>
    </div>

    <!-- 移动端抽屉 -->
    <UDrawer v-model:open="showDrawer" direction="left" title="设置" :ui="{ content: 'w-64' }">
      <template #body>
        <SettingsSidebar mobile />
      </template>
    </UDrawer>
  </div>
</template>

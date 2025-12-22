<script setup lang="ts">
// JWT 认证状态在客户端通过 plugin 初始化
</script>

<template>
  <div class="h-screen bg-(--ui-bg) flex flex-col overflow-hidden">
    <AppHeader class="flex-shrink-0" />
    <main class="flex-1 min-h-0">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
// JWT 认证状态在客户端通过 plugin 初始化
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) flex flex-col">
    <AppHeader />
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>

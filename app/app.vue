<script setup lang="ts">
// 动态设置页面标题和描述（基于运行时配置）
const config = useRuntimeConfig()
useHead({
  title: `${config.public.siteName} - ${config.public.siteSlogan}`,
  meta: [
    { name: 'description', content: config.public.siteSlogan },
  ],
})

const toaster = {
  position: 'top-right' as const,
  duration: 1500,
  swipeDirection: 'right' as const,
}
</script>

<template>
  <UApp :toaster="toaster">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { user, clear: logout } = useUserSession()
const router = useRouter()

async function handleLogout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen p-6">
    <div class="max-w-7xl mx-auto">
      <!-- 头部 -->
      <header class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-(--ui-text) mb-2">
            <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MJ Studio
            </span>
          </h1>
          <p class="text-(--ui-text-muted)">回收站</p>
        </div>

        <!-- 用户信息 -->
        <div class="flex items-center gap-4">
          <!-- 颜色模式切换 -->
          <UColorModeButton />
          <!-- 返回首页 -->
          <NuxtLink to="/" class="text-(--ui-text-muted) hover:text-(--ui-text) transition-colors">
            <UIcon name="i-heroicons-home" class="w-5 h-5" />
          </NuxtLink>
          <NuxtLink to="/settings" class="text-(--ui-text-muted) hover:text-(--ui-text) transition-colors">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5" />
          </NuxtLink>
          <div class="text-right">
            <p class="text-(--ui-text) text-sm">{{ user?.name || user?.email }}</p>
            <p class="text-(--ui-text-dimmed) text-xs">{{ user?.email }}</p>
          </div>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click="handleLogout"
          >
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4 mr-1" />
            登出
          </UButton>
        </div>
      </header>

      <!-- 主内容 -->
      <TrashList />
    </div>
  </div>
</template>

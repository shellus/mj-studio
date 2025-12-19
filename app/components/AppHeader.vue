<script setup lang="ts">
withDefaults(defineProps<{
  showNav?: boolean
}>(), {
  showNav: true,
})

const { user, loggedIn, logout } = useAuth()
const router = useRouter()
const route = useRoute()

// 用户详细信息（包含头像）
const userProfile = ref<{ avatar?: string | null; name?: string | null } | null>(null)

// 获取用户信息
async function loadUserProfile() {
  if (!loggedIn.value) return
  try {
    userProfile.value = await $fetch('/api/user')
  } catch {
    // 忽略错误
  }
}

// 登录状态变化时加载用户信息
watch(loggedIn, (val) => {
  if (val) loadUserProfile()
  else userProfile.value = null
}, { immediate: true })

// 导航项
const navItems = [
  { label: '绘图', to: '/drawing', icon: 'i-heroicons-paint-brush' },
  { label: '对话', to: '/chat', icon: 'i-heroicons-chat-bubble-left-right' },
]

// 用户下拉菜单
const userMenuItems = computed(() => [
  { label: userProfile.value?.name || user.value?.name || user.value?.email || '用户', disabled: true },
  { type: 'separator' as const },
  { label: '用户设置', icon: 'i-heroicons-user', to: '/user' },
  { label: '模型配置', icon: 'i-heroicons-cog-6-tooth', to: '/settings' },
  { type: 'separator' as const },
  { label: '退出登录', icon: 'i-heroicons-arrow-right-on-rectangle', click: handleLogout },
])

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <header class="border-b border-(--ui-border) bg-(--ui-bg-elevated) flex-shrink-0">
    <div class="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-(--ui-primary)" />
        <span class="font-bold text-lg">MJ Studio</span>
      </NuxtLink>

      <!-- 导航 + 右侧操作 -->
      <div class="flex items-center gap-2">
        <!-- 导航链接（已登录且 showNav 时显示） -->
        <template v-if="loggedIn && showNav !== false">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
          >
            <UButton
              variant="ghost"
              size="sm"
              :class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': route.path.startsWith(item.to) }"
            >
              <UIcon :name="item.icon" class="w-4 h-4 md:mr-1" />
              <span class="hidden md:inline">{{ item.label }}</span>
            </UButton>
          </NuxtLink>
        </template>

        <UColorModeButton />

        <!-- 用户菜单（已登录） -->
        <UDropdownMenu v-if="loggedIn" :items="userMenuItems">
          <UButton variant="ghost" size="sm" class="p-1">
            <img
              v-if="userProfile?.avatar"
              :src="userProfile.avatar"
              class="w-7 h-7 rounded-full object-cover"
            />
            <UIcon v-else name="i-heroicons-user-circle" class="w-6 h-6" />
          </UButton>
        </UDropdownMenu>

        <!-- 登录按钮（未登录） -->
        <NuxtLink v-else to="/login">
          <UButton size="sm">登录</UButton>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>

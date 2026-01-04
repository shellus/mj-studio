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

// 监听全局用户信息变化（用户设置页面更新后同步）
watch(user, (val) => {
  if (val && userProfile.value) {
    userProfile.value = {
      ...userProfile.value,
      name: val.name,
      avatar: val.avatar,
    }
  }
}, { deep: true })

// 导航项
const navItems = [
  { label: '创作', to: '/studio', icon: 'i-heroicons-paint-brush' },
  { label: '工作流', to: '/workflows', icon: 'i-heroicons-square-3-stack-3d' },
  { label: '对话', to: '/chat', icon: 'i-heroicons-chat-bubble-left-right' },
  { label: '文档', to: '/docs/', icon: 'i-heroicons-question-mark-circle', external: true },
  { label: '设置', to: '/settings', icon: 'i-heroicons-cog-6-tooth' },
]

// 用户下拉菜单
const userMenuItems = computed(() => [
  { label: userProfile.value?.name || user.value?.name || user.value?.email || '用户', disabled: true },
  { type: 'separator' as const },
  { label: '用户设置', icon: 'i-heroicons-user', to: '/user' },
  { type: 'separator' as const },
  { label: '退出登录', icon: 'i-heroicons-arrow-right-on-rectangle', onSelect: handleLogout },
])

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <header class="border-b border-(--ui-border) bg-(--ui-bg-elevated) flex-shrink-0">
    <div class="px-4 h-14 flex items-center justify-between">
      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2">
        <img src="/logo.png" alt="MJ Studio" class="w-7 h-7" />
        <span class="font-bold text-lg">MJ Studio</span>
      </NuxtLink>

      <!-- 导航 + 右侧操作 -->
      <div class="flex items-center gap-2">
        <!-- 导航链接（已登录且 showNav 时显示，客户端渲染避免 hydration 不匹配） -->
        <ClientOnly>
          <template v-if="loggedIn && showNav !== false">
            <template v-for="item in navItems" :key="item.to">
              <a v-if="item.external" :href="item.to">
                <UButton variant="ghost" size="sm">
                  <UIcon :name="item.icon" class="w-4 h-4 md:mr-1" />
                  <span class="hidden md:inline">{{ item.label }}</span>
                </UButton>
              </a>
              <NuxtLink v-else :to="item.to">
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
          </template>
        </ClientOnly>

        <UColorModeButton />

        <!-- 用户菜单/登录按钮（客户端渲染避免 hydration 不匹配） -->
        <ClientOnly>
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
          <NuxtLink v-else to="/login">
            <UButton size="sm">登录</UButton>
          </NuxtLink>
          <template #fallback>
            <div class="w-7 h-7" />
          </template>
        </ClientOnly>
      </div>
    </div>
  </header>
</template>

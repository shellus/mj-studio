<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { login } = useAuth()
const toast = useToast()

const isLogin = ref(true) // true=登录, false=注册
const isLoading = ref(false)

const form = reactive({
  email: '',
  password: '',
  name: '',
})

async function handleSubmit() {
  if (!form.email || !form.password) {
    toast.add({ title: '请填写邮箱和密码', color: 'error' })
    return
  }

  isLoading.value = true
  try {
    const endpoint = isLogin.value ? '/api/auth/login' : '/api/auth/register'
    const body = isLogin.value
      ? { email: form.email, password: form.password }
      : { email: form.email, password: form.password, name: form.name }

    const result = await $fetch<{ token: string; user: { id: number; email: string; name: string | null } }>(endpoint, {
      method: 'POST',
      body,
    })

    // 保存 JWT token 到 localStorage
    login(result.token, result.user)

    toast.add({
      title: isLogin.value ? '登录成功' : '注册成功',
      color: 'success',
    })
    await navigateTo('/')
  } catch (error: any) {
    toast.add({
      title: isLogin.value ? '登录失败' : '注册失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value
  form.name = ''
}
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-(--ui-bg) flex items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <!-- Logo -->
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-(--ui-text) mb-2">
            <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MJ Studio
            </span>
          </h1>
          <p class="text-(--ui-text-muted)">多模型 AI 绘图工作台</p>
        </div>

        <!-- 表单卡片 -->
        <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-2xl p-8 border border-(--ui-border) shadow-2xl">
          <h2 class="text-xl font-semibold text-(--ui-text) mb-6 text-center">
            {{ isLogin ? '登录账号' : '注册账号' }}
          </h2>

          <form @submit.prevent="handleSubmit" class="space-y-5">
            <!-- 昵称（仅注册） -->
            <div v-if="!isLogin">
              <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">昵称</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="输入昵称（可选）"
                class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary) focus:ring-1 focus:ring-(--ui-primary) transition-colors"
              />
            </div>

            <!-- 邮箱 -->
            <div>
              <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">邮箱</label>
              <input
                v-model="form.email"
                type="email"
                placeholder="输入邮箱"
                class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary) focus:ring-1 focus:ring-(--ui-primary) transition-colors"
              />
            </div>

            <!-- 密码 -->
            <div>
              <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">密码</label>
              <input
                v-model="form.password"
                type="password"
                placeholder="输入密码"
                class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary) focus:ring-1 focus:ring-(--ui-primary) transition-colors"
              />
            </div>

            <!-- 提交按钮 -->
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full py-3 px-4 rounded-lg font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <span v-if="isLoading" class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                处理中...
              </span>
              <span v-else>{{ isLogin ? '登录' : '注册' }}</span>
            </button>
          </form>

          <!-- 切换登录/注册 -->
          <div class="mt-6 text-center">
            <span class="text-(--ui-text-dimmed) text-sm">
              {{ isLogin ? '还没有账号？' : '已有账号？' }}
            </span>
            <button
              type="button"
              class="text-(--ui-primary) hover:opacity-80 text-sm ml-1 font-medium"
              @click="toggleMode"
            >
              {{ isLogin ? '立即注册' : '立即登录' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </UApp>
</template>

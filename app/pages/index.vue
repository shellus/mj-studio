<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { user, clear: logout } = useUserSession()
const { addTask, cleanup, loadTasks } = useTasks()
const { configs: modelConfigs, loadConfigs } = useModelConfigs()
const toast = useToast()
const router = useRouter()

// 页面加载时获取数据
onMounted(() => {
  loadTasks()
  loadConfigs()
})

async function handleSubmit(prompt: string, images: string[], modelConfigId: number, modelType: string) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        prompt,
        base64Array: images,
        type: images.length > 0 && !prompt ? 'blend' : 'imagine',
        modelConfigId,
        modelType,
      },
    })

    if (result.success && result.taskId) {
      await addTask(result.taskId)
      toast.add({
        title: '任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

async function handleLogout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await logout()
  router.push('/login')
}

onUnmounted(() => {
  cleanup()
})
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
          <p class="text-(--ui-text-muted)">Midjourney AI 绘图工作台</p>
        </div>

        <!-- 用户信息 -->
        <div class="flex items-center gap-4">
          <!-- 颜色模式切换 -->
          <UColorModeButton />
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
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 左侧：绘图面板 -->
        <div class="lg:col-span-1">
          <DrawingPanel :model-configs="modelConfigs" @submit="handleSubmit" />
        </div>

        <!-- 右侧：任务列表 -->
        <div class="lg:col-span-2">
          <TaskList />
        </div>
      </div>
    </div>
  </div>
</template>

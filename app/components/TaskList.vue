<script setup lang="ts">
const { tasks, isLoading, executeAction, removeTask, retryTask } = useTasks()

// 当前页面是否全部显示（非模糊状态）
const allRevealed = ref(false)

async function handleAction(taskId: number, customId: string) {
  const task = tasks.value.find((t) => t.id === taskId)
  if (!task) return

  try {
    await executeAction(task, customId)
  } catch (error: any) {
    alert(error.message || '执行失败')
  }
}

async function handleRetry(taskId: number) {
  try {
    await retryTask(taskId)
  } catch (error: any) {
    alert(error.data?.message || error.message || '重试失败')
  }
}

// 切换所有任务的模糊状态
async function toggleAllBlur() {
  const newBlurState = allRevealed.value // 当前是显示状态，切换为模糊
  allRevealed.value = !allRevealed.value

  // 找出所有有图片的任务
  const tasksWithImage = tasks.value.filter(t => t.imageUrl)

  // 批量更新
  await Promise.all(
    tasksWithImage.map(task =>
      $fetch(`/api/tasks/${task.id}/blur`, {
        method: 'PATCH',
        body: { isBlurred: newBlurState },
      }).catch(() => {}) // 忽略单个失败
    )
  )

  // 更新本地状态
  tasks.value.forEach(task => {
    if (task.imageUrl) {
      task.isBlurred = newBlurState
    }
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-(--ui-text) text-lg font-medium">生成任务</h2>
      <div class="flex items-center gap-3">
        <!-- 全局显示/隐藏切换 -->
        <button
          v-if="tasks.some(t => t.imageUrl)"
          class="p-1.5 rounded-lg hover:bg-(--ui-bg-accented) transition-colors"
          :title="allRevealed ? '隐藏所有图片' : '显示所有图片'"
          @click="toggleAllBlur"
        >
          <UIcon
            :name="allRevealed ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
            class="w-5 h-5 text-(--ui-text-dimmed)"
          />
        </button>
        <span class="text-(--ui-text-dimmed) text-sm">{{ tasks.length }} 个任务</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) mx-auto mb-2 animate-spin" />
      <p class="text-(--ui-text-dimmed)">加载中...</p>
    </div>

    <div v-else-if="tasks.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-photo" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
      <p class="text-(--ui-text-dimmed)">还没有生成任务</p>
      <p class="text-(--ui-text-dimmed)/70 text-sm mt-1">输入提示词开始创作</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @action="handleAction(task.id, $event)"
        @remove="removeTask(task.id)"
        @retry="handleRetry(task.id)"
      />
    </div>
  </div>
</template>

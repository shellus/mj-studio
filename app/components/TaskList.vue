<script setup lang="ts">
const { tasks, isLoading, executeAction, removeTask, retryTask } = useTasks()

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
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-white text-lg font-medium">生成任务</h2>
      <span class="text-white/40 text-sm">{{ tasks.length }} 个任务</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-white/40 mx-auto mb-2 animate-spin" />
      <p class="text-white/40">加载中...</p>
    </div>

    <div v-else-if="tasks.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-photo" class="w-16 h-16 text-white/20 mx-auto mb-4" />
      <p class="text-white/40">还没有生成任务</p>
      <p class="text-white/30 text-sm mt-1">输入提示词开始创作</p>
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

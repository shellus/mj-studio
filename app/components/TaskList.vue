<script setup lang="ts">
const { tasks, isLoading, currentPage, pageSize, total, executeAction, deleteTask, batchBlur, retryTask, cancelTask, loadTasks } = useTasks()

// 批量操作loading状态
const blurLoading = ref(false)

// 计算总页数
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

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

async function handleCancel(taskId: number) {
  try {
    await cancelTask(taskId)
  } catch (error: any) {
    alert(error.data?.message || error.message || '取消失败')
  }
}

async function handleDelete(taskId: number) {
  try {
    await deleteTask(taskId)
  } catch (error: any) {
    alert(error.data?.message || error.message || '删除失败')
  }
}

// 处理单个任务模糊状态变化（同步到本地状态）
function handleBlur(taskId: number, isBlurred: boolean) {
  const index = tasks.value.findIndex((t) => t.id === taskId)
  if (index >= 0) {
    tasks.value[index] = { ...tasks.value[index], isBlurred }
  }
}

// 模糊全部
async function blurAll() {
  blurLoading.value = true
  try {
    await batchBlur(true)
  } catch (error: any) {
    alert(error.data?.message || error.message || '操作失败')
  } finally {
    blurLoading.value = false
  }
}

// 取消模糊
async function unblurAll() {
  blurLoading.value = true
  try {
    await batchBlur(false)
  } catch (error: any) {
    alert(error.data?.message || error.message || '操作失败')
  } finally {
    blurLoading.value = false
  }
}

// 切换页面
function handlePageChange() {
  loadTasks()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-(--ui-text) text-lg font-medium">生成任务</h2>
      <div class="flex items-center gap-3">
        <!-- 模糊全部/取消模糊 -->
        <div v-if="tasks.some(t => t.imageUrl)" class="flex items-center gap-1">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="blurLoading"
            :disabled="blurLoading"
            @click="blurAll"
          >
            <UIcon name="i-heroicons-eye-slash" class="w-4 h-4 mr-1" />
            模糊全部
          </UButton>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="blurLoading"
            :disabled="blurLoading"
            @click="unblurAll"
          >
            <UIcon name="i-heroicons-eye" class="w-4 h-4 mr-1" />
            显示全部
          </UButton>
        </div>
        <!-- 回收站 -->
        <NuxtLink to="/trash">
          <UButton size="xs" variant="ghost" color="neutral">
            回收站
          </UButton>
        </NuxtLink>
        <span class="text-(--ui-text-dimmed) text-sm">共 {{ total }} 个任务</span>
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

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @action="handleAction(task.id, $event)"
          @remove="handleDelete(task.id)"
          @retry="handleRetry(task.id)"
          @cancel="handleCancel(task.id)"
          @blur="handleBlur(task.id, $event)"
        />
      </div>

      <!-- 分页 -->
      <div v-if="totalPages > 1" class="flex justify-center mt-6">
        <UPagination
          v-model:page="currentPage"
          :total="total"
          :items-per-page="pageSize"
          @update:page="handlePageChange"
        />
      </div>
    </template>
  </div>
</template>

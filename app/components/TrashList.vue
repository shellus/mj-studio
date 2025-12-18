<script setup lang="ts">
const { tasks, isLoading, currentPage, pageSize, total, loadTrash, restoreTask, emptyTrash } = useTrash()
const toast = useToast()

// 计算总页数
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

// 加载回收站
onMounted(() => {
  loadTrash()
})

// 恢复任务
async function handleRestore(taskId: number) {
  try {
    await restoreTask(taskId)
    toast.add({
      title: '恢复成功',
      description: '任务已恢复到任务列表',
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: '恢复失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 清空回收站
const emptyConfirm = ref(false)
const emptyLoading = ref(false)

async function handleEmptyTrash() {
  emptyLoading.value = true
  try {
    const count = await emptyTrash()
    emptyConfirm.value = false
    toast.add({
      title: '清空成功',
      description: `已永久删除 ${count} 个任务`,
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: '清空失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  } finally {
    emptyLoading.value = false
  }
}

// 切换页面
function handlePageChange() {
  loadTrash()
}

// 格式化删除时间
function formatDeletedTime(deletedAt: string | null) {
  if (!deletedAt) return ''
  const date = new Date(deletedAt)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-(--ui-text) text-lg font-medium">回收站</h2>
      <div class="flex items-center gap-3">
        <UButton
          v-if="tasks.length > 0"
          size="xs"
          variant="ghost"
          color="error"
          @click="emptyConfirm = true"
        >
          <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-1" />
          清空回收站
        </UButton>
        <span class="text-(--ui-text-dimmed) text-sm">共 {{ total }} 个任务</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) mx-auto mb-2 animate-spin" />
      <p class="text-(--ui-text-dimmed)">加载中...</p>
    </div>

    <div v-else-if="tasks.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-trash" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
      <p class="text-(--ui-text-dimmed)">回收站是空的</p>
      <p class="text-(--ui-text-dimmed)/70 text-sm mt-1">删除的任务会出现在这里</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="bg-(--ui-bg-elevated) rounded-xl p-4 border border-(--ui-border)"
        >
          <!-- 图片预览 -->
          <div class="aspect-square rounded-lg overflow-hidden bg-(--ui-bg) mb-3">
            <img
              v-if="task.imageUrl"
              :src="task.imageUrl"
              alt="生成的图片"
              class="w-full h-full object-cover"
            />
            <!-- 失败状态显示错误信息 -->
            <div v-else-if="task.status === 'failed'" class="w-full h-full flex flex-col items-center justify-center p-4 bg-error/5">
              <UIcon name="i-heroicons-exclamation-circle" class="w-10 h-10 text-error mb-2" />
              <p class="text-xs text-error text-center line-clamp-3">{{ task.error || '生成失败' }}</p>
            </div>
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-heroicons-photo" class="w-12 h-12 text-(--ui-text-dimmed)/30" />
            </div>
          </div>

          <!-- 任务信息 -->
          <div class="space-y-2">
            <p class="text-(--ui-text) text-sm line-clamp-2">
              {{ task.prompt || '(无提示词)' }}
            </p>
            <div class="flex items-center justify-between text-xs text-(--ui-text-dimmed)">
              <span>删除于 {{ formatDeletedTime(task.deletedAt) }}</span>
              <UButton
                size="xs"
                variant="soft"
                color="primary"
                @click="handleRestore(task.id)"
              >
                <UIcon name="i-heroicons-arrow-uturn-left" class="w-3.5 h-3.5 mr-1" />
                恢复
              </UButton>
            </div>
          </div>
        </div>
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

    <!-- 清空确认对话框 -->
    <UModal v-model:open="emptyConfirm" title="清空回收站" description="此操作将永久删除回收站中的所有任务，无法恢复。确定要继续吗？">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" color="neutral" @click="emptyConfirm = false">取消</UButton>
          <UButton color="error" :loading="emptyLoading" @click="handleEmptyTrash">确认清空</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

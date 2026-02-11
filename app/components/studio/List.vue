<script setup lang="ts">
import type { TaskType, ImageModelParams } from '../../shared/types'

const emit = defineEmits<{
  copyToPanel: [prompt: string | null, modelParams: ImageModelParams | null, images: string[]]
}>()

const toast = useToast()
const { tasks, isLoading, currentPage, pageSize, total, sourceType, taskType, keyword, executeAction, deleteTask, batchBlur, retryTask, cancelTask, loadTasks } = useTasks()

// 批量操作loading状态
const blurLoading = ref(false)

// 来源筛选选项
const sourceOptions = [
  { label: '绘图工作台', value: 'workbench' },
  { label: '对话插图', value: 'chat' },
  { label: 'API', value: 'api' },
  { label: '全部', value: 'all' },
]

// 任务类型筛选选项
const taskTypeOptions: { label: string; value: TaskType | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
]

// 关键词搜索（防抖）
const searchInput = ref(keyword.value)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function handleSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    keyword.value = searchInput.value
    currentPage.value = 1
    loadTasks()
  }, 300)
}

// 切换来源筛选
function handleSourceChange() {
  currentPage.value = 1
  loadTasks()
}

// 切换任务类型筛选
function handleTaskTypeChange() {
  currentPage.value = 1
  loadTasks()
}

// 计算总页数
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

async function handleAction(taskId: number, customId: string) {
  const task = tasks.value.find((t) => t.id === taskId)
  if (!task) return

  try {
    await executeAction(task, customId)
  } catch (error: any) {
    toast.add({ title: error.message || '执行失败', color: 'error' })
  }
}

async function handleRetry(taskId: number) {
  try {
    await retryTask(taskId)
  } catch (error: any) {
    toast.add({ title: error.data?.message || error.message || '重试失败', color: 'error' })
  }
}

async function handleCancel(taskId: number) {
  try {
    await cancelTask(taskId)
  } catch (error: any) {
    toast.add({ title: error.data?.message || error.message || '取消失败', color: 'error' })
  }
}

async function handleDelete(taskId: number) {
  try {
    await deleteTask(taskId)
  } catch (error: any) {
    toast.add({ title: error.data?.message || error.message || '删除失败', color: 'error' })
  }
}

// 处理单个任务模糊状态变化（同步到本地状态）
function handleBlur(taskId: number, isBlurred: boolean) {
  const index = tasks.value.findIndex((t) => t.id === taskId)
  const task = tasks.value[index]
  if (index >= 0 && task) {
    tasks.value[index] = { ...task, isBlurred }
  }
}

// 获取当前页有图片的任务ID
function getCurrentPageTaskIds() {
  return tasks.value.filter(t => t.resourceUrl).map(t => t.id)
}

// 模糊当前页
async function blurAll() {
  blurLoading.value = true
  try {
    await batchBlur(true, getCurrentPageTaskIds())
  } catch (error: any) {
    toast.add({ title: error.data?.message || error.message || '操作失败', color: 'error' })
  } finally {
    blurLoading.value = false
  }
}

// 取消模糊当前页
async function unblurAll() {
  blurLoading.value = true
  try {
    await batchBlur(false, getCurrentPageTaskIds())
  } catch (error: any) {
    toast.add({ title: error.data?.message || error.message || '操作失败', color: 'error' })
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
        <div v-if="tasks.some(t => t.resourceUrl)" class="flex items-center gap-1">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="blurLoading"
            :disabled="blurLoading"
            @click="blurAll"
          >
            <UIcon name="i-heroicons-eye-slash" class="w-4 h-4 lg:mr-1" />
            <span class="hidden lg:inline">模糊本页</span>
          </UButton>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="blurLoading"
            :disabled="blurLoading"
            @click="unblurAll"
          >
            <UIcon name="i-heroicons-eye" class="w-4 h-4 lg:mr-1" />
            <span class="hidden lg:inline">显示本页</span>
          </UButton>
        </div>
        <!-- 回收站 -->
        <NuxtLink to="/trash">
          <UButton size="xs" variant="ghost" color="neutral">
            <UIcon name="i-heroicons-trash" class="w-4 h-4 lg:mr-1" />
            <span class="hidden lg:inline">回收站</span>
          </UButton>
        </NuxtLink>
        <span class="text-(--ui-text-dimmed) text-sm">共 {{ total }} 个任务</span>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- 来源筛选 -->
      <USelectMenu
        v-model="sourceType"
        :items="sourceOptions"
        value-key="value"
        class="w-32"
        size="sm"
        @update:model-value="handleSourceChange"
      />
      <!-- 任务类型筛选 -->
      <USelectMenu
        v-model="taskType"
        :items="taskTypeOptions"
        value-key="value"
        class="w-24"
        size="sm"
        @update:model-value="handleTaskTypeChange"
      />
      <!-- 关键词搜索 -->
      <UInput
        v-model="searchInput"
        placeholder="搜索提示词..."
        size="sm"
        class="w-48"
        :ui="{ leading: 'pl-2.5' }"
        @input="handleSearchInput"
      >
        <template #leading>
          <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-(--ui-text-muted)" />
        </template>
      </UInput>
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
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <template v-for="task in tasks" :key="task.id">
          <!-- 视频任务使用 VideoCard -->
          <StudioVideoCard
            v-if="task.taskType === 'video'"
            :task="task"
            @remove="handleDelete(task.id)"
            @retry="handleRetry(task.id)"
            @cancel="handleCancel(task.id)"
            @blur="handleBlur(task.id, $event)"
            @copy-to-panel="(prompt, images) => emit('copyToPanel', prompt, null, images)"
          />
          <!-- 图片任务使用 Card -->
          <StudioCard
            v-else
            :task="task"
            @action="handleAction(task.id, $event)"
            @remove="handleDelete(task.id)"
            @retry="handleRetry(task.id)"
            @cancel="handleCancel(task.id)"
            @blur="handleBlur(task.id, $event)"
            @copy-to-panel="(prompt, modelParams, images) => emit('copyToPanel', prompt, modelParams, images)"
          />
        </template>
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

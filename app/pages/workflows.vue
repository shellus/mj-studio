<script setup lang="ts">
import type { WorkflowListItem, WorkflowTemplateListItem } from '~/shared/workflow-types'

definePageMeta({
  middleware: 'auth',
})

const toast = useToast()
const router = useRouter()

// 工作流列表
const workflows = ref<WorkflowListItem[]>([])
const templates = ref<WorkflowTemplateListItem[]>([])
const isLoading = ref(true)

// 加载数据
async function loadData() {
  isLoading.value = true
  try {
    const [workflowsRes, templatesRes] = await Promise.all([
      $fetch<{ success: boolean; data: WorkflowListItem[] }>('/api/workflows'),
      $fetch<{ success: boolean; data: WorkflowTemplateListItem[] }>('/api/workflow-templates'),
    ])
    workflows.value = workflowsRes.data || []
    templates.value = templatesRes.data || []
  } catch (error) {
    console.error('加载数据失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 刷新工作流列表
async function refreshWorkflows() {
  try {
    const res = await $fetch<{ success: boolean; data: WorkflowListItem[] }>('/api/workflows')
    workflows.value = res.data || []
  } catch (error) {
    console.error('刷新失败:', error)
  }
}

onMounted(() => {
  loadData()
})

// 新建工作流弹窗
const showNewModal = ref(false)
const newWorkflowName = ref('')
const isCreating = ref(false)

// 删除确认弹窗
const showDeleteModal = ref(false)
const deleteTarget = ref<WorkflowListItem | null>(null)
const isDeleting = ref(false)

// 创建空白工作流
async function createBlankWorkflow() {
  if (!newWorkflowName.value.trim()) {
    toast.add({ title: '请输入工作流名称', color: 'error' })
    return
  }

  isCreating.value = true
  try {
    const result = await $fetch<{ success: boolean; data: { id: number } }>('/api/workflows', {
      method: 'POST',
      body: {
        name: newWorkflowName.value.trim(),
        data: {
          version: '1.0.0',
          name: newWorkflowName.value.trim(),
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    })

    if (result.success) {
      toast.add({ title: '工作流已创建', color: 'success' })
      showNewModal.value = false
      newWorkflowName.value = ''
      // 跳转到编辑页面
      router.push(`/workflow/${result.data.id}`)
    }
  } catch (error: any) {
    toast.add({ title: '创建失败', description: error.data?.message, color: 'error' })
  } finally {
    isCreating.value = false
  }
}

// 从模板创建
async function createFromTemplate(template: WorkflowTemplateListItem) {
  try {
    const result = await $fetch<{ success: boolean; data: { id: number } }>(`/api/workflow-templates/${template.id}/use`, {
      method: 'POST',
    })

    if (result.success) {
      toast.add({ title: '工作流已创建', color: 'success' })
      router.push(`/workflow/${result.data.id}`)
    }
  } catch (error: any) {
    toast.add({ title: '创建失败', description: error.data?.message, color: 'error' })
  }
}

// 打开工作流
function openWorkflow(workflow: WorkflowListItem) {
  router.push(`/workflow/${workflow.id}`)
}

// 确认删除
function confirmDelete(workflow: WorkflowListItem) {
  deleteTarget.value = workflow
  showDeleteModal.value = true
}

// 删除工作流
async function deleteWorkflow() {
  if (!deleteTarget.value) return

  isDeleting.value = true
  try {
    await $fetch(`/api/workflows/${deleteTarget.value.id}`, {
      method: 'DELETE',
    })

    toast.add({ title: '工作流已删除', color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refreshWorkflows()
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error.data?.message, color: 'error' })
  } finally {
    isDeleting.value = false
  }
}

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-8">
    <!-- 标题 -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-(--ui-text)">工作流</h1>
        <p class="text-(--ui-text-muted) mt-1">管理你的 AI 工作流</p>
      </div>
      <UButton color="primary" @click="showNewModal = true">
        <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
        新建工作流
      </UButton>
    </div>

    <!-- 加载中 -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-(--ui-text-muted)" />
    </div>

    <!-- 模板区域 -->
    <div v-if="!isLoading && templates.length > 0" class="mb-8">
      <h2 class="text-lg font-medium text-(--ui-text) mb-4">从模板开始</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          v-for="template in templates"
          :key="template.id"
          class="border border-(--ui-border) rounded-lg p-4 hover:border-(--ui-primary) cursor-pointer transition-colors bg-(--ui-bg-elevated)"
          @click="createFromTemplate(template)"
        >
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-(--ui-bg-accented) flex items-center justify-center flex-shrink-0">
              <UIcon
                :name="template.category === 'video' ? 'i-heroicons-film' : 'i-heroicons-photo'"
                class="w-5 h-5 text-(--ui-primary)"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-(--ui-text) truncate">{{ template.name }}</h3>
              <p class="text-sm text-(--ui-text-muted) mt-0.5 line-clamp-2">{{ template.description }}</p>
              <div class="flex items-center gap-2 mt-2 text-xs text-(--ui-text-dimmed)">
                <span v-if="template.isBuiltin" class="px-1.5 py-0.5 rounded bg-(--ui-bg-accented)">内置</span>
                <span>{{ template.usageCount }} 次使用</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 工作流列表 -->
    <div v-if="!isLoading">
      <h2 class="text-lg font-medium text-(--ui-text) mb-4">我的工作流</h2>

      <div v-if="workflows.length === 0" class="text-center py-16 border border-dashed border-(--ui-border) rounded-lg">
        <UIcon name="i-heroicons-square-3-stack-3d" class="w-12 h-12 text-(--ui-text-dimmed) mx-auto mb-3" />
        <p class="text-(--ui-text-muted)">还没有工作流</p>
        <p class="text-sm text-(--ui-text-dimmed) mt-1">创建一个新工作流或从模板开始</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="workflow in workflows"
          :key="workflow.id"
          class="border border-(--ui-border) rounded-lg overflow-hidden hover:border-(--ui-primary) transition-colors bg-(--ui-bg-elevated) group"
        >
          <!-- 缩略图 -->
          <div
            class="h-32 bg-(--ui-bg-accented) flex items-center justify-center cursor-pointer"
            @click="openWorkflow(workflow)"
          >
            <img
              v-if="workflow.thumbnail"
              :src="workflow.thumbnail"
              class="w-full h-full object-cover"
            />
            <UIcon v-else name="i-heroicons-square-3-stack-3d" class="w-10 h-10 text-(--ui-text-dimmed)" />
          </div>

          <!-- 信息 -->
          <div class="p-4">
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0 cursor-pointer" @click="openWorkflow(workflow)">
                <h3 class="font-medium text-(--ui-text) truncate">{{ workflow.name }}</h3>
                <p v-if="workflow.description" class="text-sm text-(--ui-text-muted) mt-0.5 line-clamp-1">
                  {{ workflow.description }}
                </p>
                <p class="text-xs text-(--ui-text-dimmed) mt-2">
                  更新于 {{ formatTime(workflow.updatedAt) }}
                </p>
              </div>

              <!-- 操作按钮 -->
              <UDropdownMenu
                :items="[
                  { label: '打开', icon: 'i-heroicons-arrow-top-right-on-square', onSelect: () => openWorkflow(workflow) },
                  { label: '删除', icon: 'i-heroicons-trash', onSelect: () => confirmDelete(workflow) },
                ]"
              >
                <UButton
                  variant="ghost"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <UIcon name="i-heroicons-ellipsis-vertical" class="w-4 h-4" />
                </UButton>
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建工作流弹窗 -->
    <UModal v-model:open="showNewModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium">新建工作流</h3>
              <UButton variant="ghost" size="xs" @click="showNewModal = false">
                <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
              </UButton>
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="工作流名称">
              <UInput
                v-model="newWorkflowName"
                placeholder="输入工作流名称"
                @keyup.enter="createBlankWorkflow"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showNewModal = false">取消</UButton>
              <UButton color="primary" :loading="isCreating" @click="createBlankWorkflow">
                创建
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-medium">确认删除</h3>
          </template>

          <p class="text-(--ui-text-muted)">
            确定要删除工作流「{{ deleteTarget?.name }}」吗？此操作不可恢复。
          </p>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showDeleteModal = false">取消</UButton>
              <UButton color="error" :loading="isDeleting" @click="deleteWorkflow">
                删除
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

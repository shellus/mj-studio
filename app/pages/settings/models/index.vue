<script setup lang="ts">
import type { ModelTypeConfig } from '../../../shared/types'

const { configs, isLoading, loadConfigs, updateConfig, deleteConfig } = useModelConfigs()
const toast = useToast()
const router = useRouter()

// 删除确认
const showDeleteConfirm = ref(false)
const deletingConfigId = ref<number | null>(null)

onMounted(() => {
  loadConfigs()
})

function handleDeleteClick(id: number) {
  deletingConfigId.value = id
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!deletingConfigId.value) return

  try {
    await deleteConfig(deletingConfigId.value)
    toast.add({ title: '配置已删除', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '删除失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    showDeleteConfirm.value = false
    deletingConfigId.value = null
  }
}

async function handleSetDefault(id: number) {
  try {
    await updateConfig(id, { isDefault: true })
    toast.add({ title: '已设为默认', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

// 统计绘图/对话模型数量
function getModelCounts(modelTypeConfigs: ModelTypeConfig[]) {
  if (!modelTypeConfigs) return { image: 0, chat: 0 }
  const image = modelTypeConfigs.filter(c => !c.category || c.category === 'image').length
  const chat = modelTypeConfigs.filter(c => c.category === 'chat').length
  return { image, chat }
}
</script>

<template>
  <SettingsLayout>
    <!-- 操作栏 -->
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium text-(--ui-text)">模型配置</h2>
      <UButton size="sm" @click="router.push('/settings/models/new')">
        <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
        添加
      </UButton>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <!-- 空状态 -->
    <div v-else-if="configs.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-cpu-chip" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
      <p class="text-(--ui-text-muted) mb-4">还没有模型配置</p>
      <UButton @click="router.push('/settings/models/new')">添加第一个配置</UButton>
    </div>

    <!-- 配置列表 -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="config in configs"
        :key="config.id"
        class="bg-(--ui-bg-elevated) rounded-xl p-4 border border-(--ui-border) hover:border-(--ui-border-accented) transition-colors cursor-pointer flex flex-col"
        @click="router.push(`/settings/models/${config.id}`)"
      >
        <!-- 标题行 -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="text-(--ui-text) font-medium truncate">{{ config.name }}</h3>
            <span
              v-if="config.isDefault"
              class="px-2 py-0.5 rounded-full text-xs font-medium bg-(--ui-success)/20 text-(--ui-success) shrink-0"
            >
              默认
            </span>
          </div>
          <div class="flex gap-1 shrink-0" @click.stop>
            <UButton size="xs" variant="ghost" color="neutral" @click="router.push(`/settings/models/${config.id}`)">
              <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
            </UButton>
            <UButton size="xs" variant="ghost" color="error" @click="handleDeleteClick(config.id)">
              <UIcon name="i-heroicons-trash" class="w-4 h-4" />
            </UButton>
          </div>
        </div>

        <!-- API 信息 -->
        <p class="text-(--ui-text-dimmed) text-sm truncate">{{ config.baseUrl }}</p>
        <p class="text-(--ui-text-dimmed)/70 text-xs mt-1">API Key: {{ config.apiKey.slice(0, 8) }}...</p>

        <!-- 模型数量统计 -->
        <div class="mt-3 flex flex-wrap gap-2">
          <span v-if="getModelCounts(config.modelTypeConfigs).image > 0" class="text-xs px-2 py-1 rounded bg-(--ui-bg-muted) text-(--ui-text-muted)">
            🎨 {{ getModelCounts(config.modelTypeConfigs).image }}
          </span>
          <span v-if="getModelCounts(config.modelTypeConfigs).chat > 0" class="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
            💬 {{ getModelCounts(config.modelTypeConfigs).chat }}
          </span>
        </div>

        <!-- 底部操作 -->
        <div class="mt-auto pt-3 flex justify-end" @click.stop>
          <UButton v-if="!config.isDefault" size="xs" variant="ghost" color="neutral" @click="handleSetDefault(config.id)">
            设为默认
          </UButton>
        </div>
      </div>
    </div>

    <!-- 删除确认 Modal -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定删除此配置？">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
        </div>
      </template>
    </UModal>
  </SettingsLayout>
</template>

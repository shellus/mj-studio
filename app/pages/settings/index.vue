<script setup lang="ts">
import type { ModelType, ModelTypeConfig } from '../../shared/types'
import {
  MODEL_TYPE_LABELS,
} from '../../shared/constants'

definePageMeta({
  middleware: 'auth',
})

const { configs, isLoading, loadConfigs, createConfig, updateConfig, deleteConfig } = useModelConfigs()
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

// 导出配置
function exportConfigs() {
  if (configs.value.length === 0) {
    toast.add({ title: '没有可导出的配置', color: 'warning' })
    return
  }

  // 准备导出数据，移除 id 字段
  const exportData = configs.value.map(config => ({
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    remark: config.remark,
    isDefault: config.isDefault,
    modelTypeConfigs: config.modelTypeConfigs,
  }))

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mj-studio-configs-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)

  toast.add({ title: '配置已导出', color: 'success' })
}

// 导入配置
const fileInputRef = ref<HTMLInputElement>()
const isImporting = ref(false)

function triggerImport() {
  fileInputRef.value?.click()
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  isImporting.value = true
  try {
    const text = await file.text()
    const importData = JSON.parse(text)

    if (!Array.isArray(importData)) {
      throw new Error('无效的配置文件格式')
    }

    let successCount = 0
    let skipCount = 0

    for (const config of importData) {
      // 验证必要字段
      if (!config.name || !config.baseUrl || !config.apiKey) {
        skipCount++
        continue
      }

      // 检查是否已存在同名配置
      const exists = configs.value.some(c => c.name === config.name)
      if (exists) {
        skipCount++
        continue
      }

      await createConfig({
        name: config.name,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelTypeConfigs: config.modelTypeConfigs || [],
        remark: config.remark,
        isDefault: false, // 导入时不设为默认
      })
      successCount++
    }

    if (successCount > 0) {
      toast.add({
        title: `成功导入 ${successCount} 个配置`,
        description: skipCount > 0 ? `跳过 ${skipCount} 个（已存在或无效）` : undefined,
        color: 'success',
      })
    } else {
      toast.add({
        title: '没有导入任何配置',
        description: '所有配置已存在或格式无效',
        color: 'warning',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '导入失败',
      description: error.message || '文件格式错误',
      color: 'error',
    })
  } finally {
    isImporting.value = false
    input.value = '' // 重置 input，允许再次选择同一文件
  }
}
</script>

<template>
  <div class="p-6">
    <div class="max-w-4xl mx-auto">
      <!-- 页面标题 -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-(--ui-text)">设置</h1>
          <p class="text-(--ui-text-muted) text-sm mt-1">管理你的 AI 服务配置</p>
        </div>
        <div class="flex gap-2">
          <UButton variant="outline" color="neutral" @click="triggerImport" :loading="isImporting">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4 mr-1" />
            导入
          </UButton>
          <UButton variant="outline" color="neutral" @click="exportConfigs">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            导出
          </UButton>
          <UButton @click="router.push('/settings/new')">
            <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
            添加配置
          </UButton>
        </div>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleImport"
        />
      </div>

      <!-- 配置列表 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <div v-else-if="configs.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
        <p class="text-(--ui-text-muted) mb-4">还没有模型配置</p>
        <UButton @click="router.push('/settings/new')">添加第一个配置</UButton>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="config in configs"
          :key="config.id"
          class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-xl p-5 border border-(--ui-border) hover:border-(--ui-border-accented) transition-colors cursor-pointer"
          @click="router.push(`/settings/${config.id}`)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-(--ui-text) font-medium">{{ config.name }}</h3>
                <span
                  v-if="config.isDefault"
                  class="px-2 py-0.5 rounded-full text-xs font-medium bg-(--ui-success)/20 text-(--ui-success)"
                >
                  默认
                </span>
              </div>
              <p class="text-(--ui-text-dimmed) text-sm mb-1">{{ config.baseUrl }}</p>
              <p class="text-(--ui-text-dimmed)/70 text-xs">API Key: {{ config.apiKey.slice(0, 8) }}...{{ config.apiKey.slice(-4) }}</p>
              <p v-if="config.remark" class="text-(--ui-text-dimmed) text-xs mt-2 italic">{{ config.remark }}</p>

              <!-- 模型数量统计 -->
              <div class="mt-3 flex gap-3">
                <span
                  v-if="getModelCounts(config.modelTypeConfigs).image > 0"
                  class="text-xs px-2 py-1 rounded bg-(--ui-bg-muted) text-(--ui-text-muted)"
                >
                  🎨 绘图模型 {{ getModelCounts(config.modelTypeConfigs).image }}
                </span>
                <span
                  v-if="getModelCounts(config.modelTypeConfigs).chat > 0"
                  class="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                >
                  💬 对话模型 {{ getModelCounts(config.modelTypeConfigs).chat }}
                </span>
              </div>

              <!-- 模型类型详情 -->
              <div v-if="config.modelTypeConfigs && config.modelTypeConfigs.length > 0" class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="mtc in config.modelTypeConfigs"
                  :key="mtc.modelName"
                  class="text-xs text-(--ui-text-dimmed)"
                >
                  {{ MODEL_TYPE_LABELS[mtc.modelType] }}
                  <span v-if="mtc.modelName" class="opacity-60">({{ mtc.modelName }})</span>
                  <span v-if="config.modelTypeConfigs.indexOf(mtc) < config.modelTypeConfigs.length - 1" class="mx-1">·</span>
                </span>
              </div>
            </div>

            <div class="flex gap-2" @click.stop>
              <UButton
                v-if="!config.isDefault"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="handleSetDefault(config.id)"
              >
                设为默认
              </UButton>
              <UButton size="xs" variant="ghost" color="neutral" @click="router.push(`/settings/${config.id}`)">
                <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
              </UButton>
              <UButton size="xs" variant="ghost" color="error" @click="handleDeleteClick(config.id)">
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认 Modal -->
      <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定删除此配置？相关的任务记录将无法查看模型信息。">
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="error" @click="confirmDelete">删除</UButton>
            <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

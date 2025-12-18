<script setup lang="ts">
import type { ModelCategory, ImageModelType, ChatModelType, ModelType, ApiFormat, ModelTypeConfig } from '../shared/types'
import {
  IMAGE_MODEL_TYPES,
  CHAT_MODEL_TYPES,
  ALL_MODEL_TYPES,
  MODEL_API_FORMAT_OPTIONS,
  MODEL_CATEGORY_MAP,
  DEFAULT_MODEL_NAMES,
  DEFAULT_ESTIMATED_TIMES,
  MODEL_TYPE_LABELS,
  API_FORMAT_LABELS,
  CATEGORY_LABELS,
} from '../shared/constants'

definePageMeta({
  middleware: 'auth',
})

const { configs, isLoading, loadConfigs, createConfig, updateConfig, deleteConfig } = useModelConfigs()
const toast = useToast()
const router = useRouter()

// 表单状态
const showForm = ref(false)
const editingConfig = ref<number | null>(null)
const form = ref({
  name: '',
  baseUrl: '',
  apiKey: '',
  modelTypeConfigs: [] as ModelTypeConfig[],
  remark: '',
  isDefault: false,
})

// 获取可用的请求格式（使用共享常量 MODEL_API_FORMAT_OPTIONS）
function getAvailableFormats(modelType: ModelType): ApiFormat[] {
  return MODEL_API_FORMAT_OPTIONS[modelType] || []
}

// 添加模型类型配置
function addModelTypeConfig() {
  // 找一个还没添加的模型类型（使用共享常量 ALL_MODEL_TYPES）
  const existingTypes = form.value.modelTypeConfigs.map(c => c.modelType)
  const availableType = ALL_MODEL_TYPES.find(t => !existingTypes.includes(t))

  if (!availableType) {
    toast.add({ title: '已添加所有模型类型', color: 'warning' })
    return
  }

  const defaultFormat = MODEL_API_FORMAT_OPTIONS[availableType][0]
  const category = MODEL_CATEGORY_MAP[availableType]
  form.value.modelTypeConfigs.push({
    category,
    modelType: availableType,
    apiFormat: defaultFormat,
    modelName: DEFAULT_MODEL_NAMES[availableType],
    estimatedTime: DEFAULT_ESTIMATED_TIMES[availableType as ImageModelType],
  })
}

// 移除模型类型配置
function removeModelTypeConfig(index: number) {
  form.value.modelTypeConfigs.splice(index, 1)
}

// 当模型类型变化时，更新默认值
function onModelTypeChange(index: number) {
  const config = form.value.modelTypeConfigs[index]
  const availableFormats = getAvailableFormats(config.modelType as ModelType)

  // 如果当前格式不可用，切换到第一个可用格式
  if (!availableFormats.includes(config.apiFormat)) {
    config.apiFormat = availableFormats[0]
  }

  // 更新分类（使用共享常量 MODEL_CATEGORY_MAP）
  config.category = MODEL_CATEGORY_MAP[config.modelType as ModelType]

  // 更新默认模型名称（使用共享常量 DEFAULT_MODEL_NAMES）
  config.modelName = DEFAULT_MODEL_NAMES[config.modelType as ModelType]

  // 更新预计时间（仅绘图模型，使用共享常量 DEFAULT_ESTIMATED_TIMES）
  if (config.category === 'image') {
    config.estimatedTime = DEFAULT_ESTIMATED_TIMES[config.modelType as ImageModelType]
  } else {
    config.estimatedTime = undefined
  }
}

onMounted(() => {
  loadConfigs()
})

function openCreateForm() {
  editingConfig.value = null
  form.value = {
    name: '',
    baseUrl: '',
    apiKey: '',
    modelTypeConfigs: [{
      category: 'image',
      modelType: 'midjourney',
      apiFormat: 'mj-proxy',
      modelName: '',
      estimatedTime: 60,
    }],
    remark: '',
    isDefault: configs.value.length === 0,
  }
  showForm.value = true
}

function openEditForm(config: typeof configs.value[0]) {
  editingConfig.value = config.id
  form.value = {
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelTypeConfigs: config.modelTypeConfigs ? [...config.modelTypeConfigs] : [],
    remark: config.remark || '',
    isDefault: config.isDefault,
  }
  showForm.value = true
}

async function handleSubmit() {
  if (form.value.modelTypeConfigs.length === 0) {
    toast.add({ title: '请至少添加一种模型类型', color: 'error' })
    return
  }

  try {
    if (editingConfig.value) {
      await updateConfig(editingConfig.value, {
        name: form.value.name,
        baseUrl: form.value.baseUrl,
        apiKey: form.value.apiKey,
        modelTypeConfigs: form.value.modelTypeConfigs,
        remark: form.value.remark || null,
        isDefault: form.value.isDefault,
      })
      toast.add({ title: '配置已更新', color: 'success' })
    } else {
      await createConfig({
        name: form.value.name,
        baseUrl: form.value.baseUrl,
        apiKey: form.value.apiKey,
        modelTypeConfigs: form.value.modelTypeConfigs,
        remark: form.value.remark,
        isDefault: form.value.isDefault,
      })
      toast.add({ title: '配置已创建', color: 'success' })
    }
    showForm.value = false
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

async function handleDelete(id: number) {
  if (!confirm('确定删除此配置？相关的任务记录将无法查看模型信息。')) return

  try {
    await deleteConfig(id)
    toast.add({ title: '配置已删除', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '删除失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
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

// 格式化模型类型显示（使用共享常量 MODEL_TYPE_LABELS）
function formatModelTypes(modelTypeConfigs: ModelTypeConfig[]) {
  if (!modelTypeConfigs || modelTypeConfigs.length === 0) return '-'
  return modelTypeConfigs.map(c => MODEL_TYPE_LABELS[c.modelType as ModelType]).join(' / ')
}

// 按分类获取模型类型列表（使用共享常量 IMAGE_MODEL_TYPES / CHAT_MODEL_TYPES）
function getModelTypesByCategory(category: ModelCategory): ModelType[] {
  return category === 'image' ? IMAGE_MODEL_TYPES : CHAT_MODEL_TYPES
}
</script>

<template>
  <div class="min-h-screen p-6">
    <div class="max-w-4xl mx-auto">
      <!-- 头部 -->
      <header class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-(--ui-text) mb-1">模型配置</h1>
          <p class="text-(--ui-text-muted) text-sm">管理你的AI绘图服务配置</p>
        </div>
        <div class="flex gap-3">
          <UButton variant="ghost" color="neutral" @click="router.push('/')">
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
            返回
          </UButton>
          <UButton @click="openCreateForm">
            <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
            添加配置
          </UButton>
        </div>
      </header>

      <!-- 配置列表 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <div v-else-if="configs.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
        <p class="text-(--ui-text-muted) mb-4">还没有模型配置</p>
        <UButton @click="openCreateForm">添加第一个配置</UButton>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="config in configs"
          :key="config.id"
          class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-xl p-5 border border-(--ui-border)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-(--ui-text) font-medium">{{ config.name }}</h3>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-(--ui-primary)/20 text-(--ui-primary)">
                  {{ formatModelTypes(config.modelTypeConfigs) }}
                </span>
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

              <!-- 模型类型详情 -->
              <div v-if="config.modelTypeConfigs && config.modelTypeConfigs.length > 0" class="mt-3 flex flex-wrap gap-2">
                <div
                  v-for="mtc in config.modelTypeConfigs"
                  :key="mtc.modelName"
                  :class="[
                    'text-xs px-2 py-1 rounded',
                    mtc.category === 'chat'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-(--ui-bg-muted) text-(--ui-text-muted)'
                  ]"
                >
                  <span v-if="mtc.category === 'chat'" class="mr-1">💬</span>
                  <span v-else class="mr-1">🎨</span>
                  {{ MODEL_TYPE_LABELS[mtc.modelType] }}
                  <span class="text-(--ui-text-dimmed)">({{ API_FORMAT_LABELS[mtc.apiFormat] }})</span>
                  <span v-if="mtc.modelName" class="text-(--ui-text-dimmed)">: {{ mtc.modelName }}</span>
                </div>
              </div>
            </div>

            <div class="flex gap-2">
              <UButton
                v-if="!config.isDefault"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="handleSetDefault(config.id)"
              >
                设为默认
              </UButton>
              <UButton size="xs" variant="ghost" color="neutral" @click="openEditForm(config)">
                <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
              </UButton>
              <UButton size="xs" variant="ghost" color="error" @click="handleDelete(config.id)">
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建/编辑表单 Modal -->
      <UModal v-model:open="showForm">
        <template #content>
          <div class="p-6 max-h-[80vh] overflow-y-auto">
            <h2 class="text-xl font-bold text-(--ui-text) mb-6">
              {{ editingConfig ? '编辑配置' : '添加配置' }}
            </h2>

            <form class="space-y-4" @submit.prevent="handleSubmit">
              <!-- 配置名称 -->
              <div>
                <label class="block text-(--ui-text-muted) text-sm mb-2">配置名称</label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="例如：我的MJ账号"
                  class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary)"
                  required
                />
              </div>

              <!-- API地址 -->
              <div>
                <label class="block text-(--ui-text-muted) text-sm mb-2">API地址</label>
                <input
                  v-model="form.baseUrl"
                  type="url"
                  placeholder="https://api.example.com"
                  class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary)"
                  required
                />
              </div>

              <!-- API密钥 -->
              <div>
                <label class="block text-(--ui-text-muted) text-sm mb-2">API密钥</label>
                <input
                  v-model="form.apiKey"
                  type="password"
                  placeholder="sk-xxx..."
                  class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary)"
                  required
                />
              </div>

              <!-- 模型类型配置 -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-(--ui-text-muted) text-sm">支持的模型类型</label>
                  <UButton size="xs" variant="ghost" @click="addModelTypeConfig">
                    <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
                    添加
                  </UButton>
                </div>

                <div class="space-y-3">
                  <div
                    v-for="(mtc, index) in form.modelTypeConfigs"
                    :key="index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <!-- 分类选择 -->
                    <div class="flex items-center gap-4 mb-3 pb-3 border-b border-(--ui-border)">
                      <span class="text-(--ui-text-dimmed) text-xs">分类</span>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          :class="[
                            'px-3 py-1 rounded-full text-xs transition-colors',
                            (mtc.category || 'image') === 'image'
                              ? 'bg-(--ui-primary) text-white'
                              : 'bg-(--ui-bg) text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)'
                          ]"
                          @click="mtc.category = 'image'; mtc.modelType = imageModelTypeOptions[0]; onModelTypeChange(index)"
                        >
                          绘图
                        </button>
                        <button
                          type="button"
                          :class="[
                            'px-3 py-1 rounded-full text-xs transition-colors',
                            mtc.category === 'chat'
                              ? 'bg-(--ui-primary) text-white'
                              : 'bg-(--ui-bg) text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)'
                          ]"
                          @click="mtc.category = 'chat'; mtc.modelType = chatModelTypeOptions[0]; onModelTypeChange(index)"
                        >
                          对话
                        </button>
                      </div>
                      <!-- 删除按钮 -->
                      <button
                        type="button"
                        class="ml-auto p-1 text-(--ui-text-dimmed) hover:text-(--ui-error)"
                        @click="removeModelTypeConfig(index)"
                      >
                        <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
                      </button>
                    </div>

                    <div class="flex items-start gap-3">
                      <!-- 模型类型 -->
                      <div class="flex-1">
                        <label class="block text-(--ui-text-dimmed) text-xs mb-1">模型类型</label>
                        <select
                          v-model="mtc.modelType"
                          class="w-full px-3 py-2 rounded bg-(--ui-bg) border border-(--ui-border-accented) text-(--ui-text) text-sm"
                          @change="onModelTypeChange(index)"
                        >
                          <option v-for="type in getModelTypesByCategory(mtc.category || 'image')" :key="type" :value="type">
                            {{ MODEL_TYPE_LABELS[type] }}
                          </option>
                        </select>
                      </div>

                      <!-- 请求格式 -->
                      <div class="flex-1">
                        <label class="block text-(--ui-text-dimmed) text-xs mb-1">请求格式</label>
                        <select
                          v-model="mtc.apiFormat"
                          class="w-full px-3 py-2 rounded bg-(--ui-bg) border border-(--ui-border-accented) text-(--ui-text) text-sm"
                        >
                          <option v-for="fmt in getAvailableFormats(mtc.modelType)" :key="fmt" :value="fmt">
                            {{ API_FORMAT_LABELS[fmt] }}
                          </option>
                        </select>
                      </div>
                    </div>

                    <!-- 模型名称 -->
                    <div class="mt-2">
                      <label class="block text-(--ui-text-dimmed) text-xs mb-1">模型名称（不同中转站可能不同）</label>
                      <input
                        v-model="mtc.modelName"
                        type="text"
                        :placeholder="DEFAULT_MODEL_NAMES[mtc.modelType] || '可选'"
                        class="w-full px-3 py-2 rounded bg-(--ui-bg) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) text-sm"
                      />
                    </div>

                    <!-- 预计时间（仅绘图模型显示） -->
                    <div v-if="(mtc.category || 'image') === 'image'" class="mt-2">
                      <label class="block text-(--ui-text-dimmed) text-xs mb-1">预计生成时间（秒）</label>
                      <input
                        v-model.number="mtc.estimatedTime"
                        type="number"
                        min="1"
                        class="w-full px-3 py-2 rounded bg-(--ui-bg) border border-(--ui-border-accented) text-(--ui-text) text-sm"
                      />
                    </div>
                  </div>
                </div>

                <p v-if="form.modelTypeConfigs.length === 0" class="text-(--ui-text-dimmed) text-sm text-center py-4">
                  点击"添加"按钮添加模型类型
                </p>
              </div>

              <!-- 备注 -->
              <div>
                <label class="block text-(--ui-text-muted) text-sm mb-2">备注（可选）</label>
                <textarea
                  v-model="form.remark"
                  placeholder="添加一些说明..."
                  rows="2"
                  class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border-accented) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary) resize-none"
                />
              </div>

              <!-- 设为默认 -->
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="form.isDefault"
                  type="checkbox"
                  class="w-5 h-5 rounded bg-(--ui-bg-muted) border-(--ui-border-accented) text-(--ui-primary) focus:ring-(--ui-primary)"
                />
                <span class="text-(--ui-text-muted)">设为默认配置</span>
              </label>

              <!-- 提交按钮 -->
              <div class="flex gap-3 pt-4">
                <UButton type="submit" class="flex-1">
                  {{ editingConfig ? '保存' : '创建' }}
                </UButton>
                <UButton type="button" variant="outline" color="neutral" class="flex-1" @click="showForm = false">
                  取消
                </UButton>
              </div>
            </form>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

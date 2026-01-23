<script setup lang="ts">
import type { ModelCategory, ApiKeyConfig, UpstreamPlatform, ModelCapability } from '../../../shared/types'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'
import type { AimodelInput } from '../../../composables/useUpstreams'
import { CATEGORY_LABELS } from '../../../shared/constants'
import { getModelLogo } from '../../../shared/model-logo'
import { getModelGroup } from '../../../shared/model-inference'
import draggable from 'vuedraggable'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { upstreams, loadUpstreams, createUpstream, updateUpstream, deleteUpstream } = useUpstreams()

// 是否是新建模式
const isNew = computed(() => route.params.id === 'new')
const upstreamId = computed(() => isNew.value ? null : Number(route.params.id))

// 页面标题
const pageTitle = computed(() => isNew.value ? '添加上游配置' : '编辑上游配置')

// 表单状态
const form = reactive({
  name: '',
  baseUrl: '',
  remark: '',
  upstreamPlatform: undefined as UpstreamPlatform | undefined,
  userApiKey: '',
  disabled: false,
})

// 多 Key 配置
const apiKeys = ref<ApiKeyConfig[]>([{ name: 'default', key: '' }])

// 统一模型列表
const aimodels = ref<AimodelInput[]>([])

// 分类筛选
const categoryFilter = ref<ModelCategory | 'all'>('all')
const groupFilter = ref<string>('all')

// 模态框状态
const showEditModal = ref(false)
const showImportModal = ref(false)
const editingModel = ref<AimodelInput | null>(null)
const editingIndex = ref<number | null>(null)

// 批量管理状态
const isBatchMode = ref(false)
const selectedModels = ref<Set<string>>(new Set())

// 获取模型唯一标识
function getModelKey(model: AimodelInput): string {
  return model.id ? `id-${model.id}` : `name-${model.modelName}`
}

// 切换批量管理模式
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) {
    selectedModels.value.clear()
  }
}

// 切换单个模型选中状态
function toggleModelSelection(model: AimodelInput) {
  const key = getModelKey(model)
  if (selectedModels.value.has(key)) {
    selectedModels.value.delete(key)
  } else {
    selectedModels.value.add(key)
  }
}

// 全选/取消全选（仅筛选后的模型）
function toggleSelectAll() {
  const filteredKeys = filteredModels.value.map(m => getModelKey(m))
  const allSelected = filteredKeys.every(key => selectedModels.value.has(key))

  if (allSelected) {
    // 取消选中筛选后的模型
    filteredKeys.forEach(key => selectedModels.value.delete(key))
  } else {
    // 选中所有筛选后的模型
    filteredKeys.forEach(key => selectedModels.value.add(key))
  }
}

// 是否全选状态
const isAllSelected = computed(() => {
  if (filteredModels.value.length === 0) return false
  return filteredModels.value.every(m => selectedModels.value.has(getModelKey(m)))
})

// 删除选中的模型
const showDeleteConfirmBatch = ref(false)
function deleteSelectedModels() {
  showDeleteConfirmBatch.value = true
}
function confirmDeleteSelected() {
  const keysToDelete = new Set(selectedModels.value)
  aimodels.value = aimodels.value.filter(m => !keysToDelete.has(getModelKey(m)))
  selectedModels.value.clear()
  updateSortOrder()
  showDeleteConfirmBatch.value = false
}

// 筛选变化时清除不可见模型的选择状态
watch([categoryFilter, groupFilter], () => {
  const currentKeys = new Set(filteredModels.value.map(m => getModelKey(m)))
  for (const key of selectedModels.value) {
    if (!currentKeys.has(key)) {
      selectedModels.value.delete(key)
    }
  }
})

// 能力配置（图标 + 颜色）
const capabilityConfig: Record<ModelCapability, { icon: string; color: string }> = {
  vision: { icon: 'i-heroicons-eye', color: 'text-green-500' },
  reasoning: { icon: 'i-heroicons-light-bulb', color: 'text-purple-500' },
  function_calling: { icon: 'i-heroicons-wrench', color: 'text-amber-500' },
  web_search: { icon: 'i-heroicons-globe-alt', color: 'text-blue-500' },
}

// 分类筛选选项
const categoryFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '对话', value: 'chat' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
]

// 分组筛选选项（动态生成）
const groupFilterOptions = computed(() => {
  const groups = new Set<string>()
  for (const model of aimodels.value) {
    groups.add(getModelGroup(model.modelName || model.name || ''))
  }
  return [
    { label: '全部厂商', value: 'all' },
    ...Array.from(groups).sort().map(g => ({ label: g, value: g })),
  ]
})

// 过滤后的模型列表
const filteredModels = computed(() => {
  let models = aimodels.value

  // 分类筛选
  if (categoryFilter.value !== 'all') {
    models = models.filter(m => m.category === categoryFilter.value)
  }

  // 分组筛选
  if (groupFilter.value !== 'all') {
    models = models.filter(m => getModelGroup(m.modelName || m.name || '') === groupFilter.value)
  }

  return models
})

// 表单验证
function validate(state: typeof form): FormError[] {
  const errors: FormError[] = []
  if (!state.name?.trim()) {
    errors.push({ name: 'name', message: '请输入配置名称' })
  }
  if (!state.baseUrl?.trim()) {
    errors.push({ name: 'baseUrl', message: '请输入API地址' })
  }
  const hasValidKey = apiKeys.value.some(k => k.key?.trim())
  if (!hasValidKey) {
    errors.push({ name: 'apiKey', message: '请至少添加一个API密钥' })
  }
  if (state.upstreamPlatform && !state.userApiKey?.trim()) {
    errors.push({ name: 'upstreamPlatform', message: '请输入用于查询余额的 API Key' })
  }
  return errors
}

// 加载配置数据
async function loadUpstreamData() {
  if (!isNew.value && upstreamId.value) {
    const upstream = upstreams.value.find(u => u.id === upstreamId.value)
    if (upstream) {
      Object.assign(form, {
        name: upstream.name,
        baseUrl: upstream.baseUrl,
        remark: upstream.remark || '',
        upstreamPlatform: upstream.upstreamPlatform || undefined,
        userApiKey: upstream.userApiKey || '',
        disabled: upstream.disabled || false,
      })
      apiKeys.value = upstream.apiKeys
      // 统一加载所有模型
      if (upstream.aimodels) {
        aimodels.value = upstream.aimodels.map(m => ({
          id: m.id,
          category: m.category || 'image',
          modelType: m.modelType,
          apiFormat: m.apiFormat,
          modelName: m.modelName,
          name: m.name,
          capabilities: m.capabilities || [],
          estimatedTime: m.estimatedTime,
          keyName: m.keyName,
          sortOrder: m.sortOrder,
        }))
      }
    } else {
      toast.add({ title: '配置不存在', color: 'error' })
      router.push('/settings/upstreams')
    }
  } else {
    apiKeys.value = [{ name: 'default', key: '' }]
  }
}

onMounted(async () => {
  // 确保上游数据已加载
  if (upstreams.value.length === 0) {
    await loadUpstreams()
  }
  loadUpstreamData()
})

// 打开编辑模态框（新增）
function openAddModal() {
  editingIndex.value = null
  editingModel.value = null
  showEditModal.value = true
}

// 打开编辑模态框（编辑）
function openEditModal(model: AimodelInput) {
  editingIndex.value = aimodels.value.indexOf(model)
  editingModel.value = { ...model }
  showEditModal.value = true
}

// 保存模型（新增或更新）
function onSaveModel(model: AimodelInput) {
  if (editingIndex.value !== null && editingIndex.value >= 0) {
    // 编辑模式：按下标更新
    aimodels.value[editingIndex.value] = model
  } else {
    // 新增模式
    aimodels.value.push(model)
  }
  editingIndex.value = null
}

// 删除模型（通过模型对象查找并删除）
function removeModel(model: AimodelInput) {
  const index = aimodels.value.findIndex(m =>
    m.id === model.id && m.modelName === model.modelName && m.name === model.name
  )
  if (index !== -1) {
    aimodels.value.splice(index, 1)
  }
}

// 从上游导入模型
function onImportModels(models: AimodelInput[]) {
  const existingNames = new Set(aimodels.value.map(m => m.modelName))
  const newModels = models.filter(m => !existingNames.has(m.modelName))

  if (newModels.length === 0) {
    toast.add({ title: '所选模型已全部存在', color: 'warning' })
    return
  }

  aimodels.value.push(...newModels)
  updateSortOrder()

  const skipped = models.length - newModels.length
  if (skipped > 0) {
    toast.add({ title: `已导入 ${newModels.length} 个模型，跳过 ${skipped} 个已存在的`, color: 'success' })
  } else {
    toast.add({ title: `已导入 ${newModels.length} 个模型`, color: 'success' })
  }
}

// 拖拽结束后更新 sortOrder
function updateSortOrder() {
  aimodels.value.forEach((model, index) => {
    model.sortOrder = index
  })
}

// ==================== Key 管理 ====================

// 添加新 Key
function addApiKey() {
  const newName = `key-${apiKeys.value.length}`
  apiKeys.value.push({ name: newName, key: '' })
}

// 移除 Key
function removeApiKey(index: number) {
  if (apiKeys.value.length <= 1) {
    toast.add({ title: '至少保留一个 Key', color: 'warning' })
    return
  }
  apiKeys.value.splice(index, 1)
}

// 余额查询 API 类型选项
const upstreamPlatformOptions = [
  { label: '不查询', value: undefined },
  { label: 'OneAPI/NewAPI', value: 'oneapi' },
]

// 获取可用的 Key 名称列表（用于模型配置选择）
const availableKeyNames = computed(() => {
  return apiKeys.value.map(k => ({ label: k.name, value: k.name }))
})

// 提交表单
async function onSubmit(event: FormSubmitEvent<typeof form>) {
  const validApiKeys = apiKeys.value.filter(k => k.key?.trim())
  if (validApiKeys.length === 0) {
    toast.add({ title: '请至少添加一个有效的 API 密钥', color: 'error' })
    return
  }

  if (aimodels.value.length === 0) {
    toast.add({ title: '请至少添加一种模型', color: 'error' })
    return
  }

  try {
    if (isNew.value) {
      await createUpstream({
        name: form.name,
        baseUrl: form.baseUrl,
        apiKeys: validApiKeys,
        aimodels: aimodels.value,
        remark: form.remark,
        upstreamPlatform: form.upstreamPlatform,
        userApiKey: form.userApiKey || undefined,
        disabled: form.disabled,
      })
      toast.add({ title: '配置已创建', color: 'success' })
    } else {
      await updateUpstream(upstreamId.value!, {
        name: form.name,
        baseUrl: form.baseUrl,
        apiKeys: validApiKeys,
        aimodels: aimodels.value,
        remark: form.remark || null,
        upstreamPlatform: form.upstreamPlatform || null,
        userApiKey: form.userApiKey || null,
        disabled: form.disabled,
      })
      toast.add({ title: '配置已更新', color: 'success' })
    }
    router.back()
  } catch (error: unknown) {
    const err = error as { data?: { message?: string }; message?: string }
    toast.add({
      title: '操作失败',
      description: err.data?.message || err.message,
      color: 'error',
    })
  }
}

// 删除上游配置
const showDeleteConfirm = ref(false)

async function confirmDelete() {
  if (!upstreamId.value) return
  try {
    await deleteUpstream(upstreamId.value)
    toast.add({ title: '配置已删除', color: 'success' })
    router.push('/settings/upstreams')
  } catch (error: any) {
    toast.add({
      title: '删除失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
  showDeleteConfirm.value = false
}
</script>

<template>
  <SettingsLayout>
    <!-- 页面标题 -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-(--ui-text)">{{ pageTitle }}</h1>
        <p class="text-(--ui-text-muted) text-sm mt-1">配置 AI 服务的连接信息和支持的模型</p>
      </div>
      <div class="flex gap-2">
        <UButton variant="outline" color="neutral" @click="router.back()">取消</UButton>
        <UButton type="submit" form="upstream-form">{{ isNew ? '创建' : '保存' }}</UButton>
      </div>
    </div>

    <!-- 模型ID说明 -->
    <div v-if="!isNew" class="mb-4 p-3 rounded-lg bg-(--ui-warning)/10 border border-(--ui-warning)/20">
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-(--ui-warning) shrink-0 mt-0.5" />
        <p class="text-sm text-(--ui-text-muted)">
          模型 ID 用于关联到任务和消息记录。删除模型采用软删除，不会导致历史关联失效。
        </p>
      </div>
    </div>

    <!-- 表单 -->
      <UForm id="upstream-form" :state="form" :validate="validate" class="space-y-6" autocomplete="off" @submit="onSubmit">
        <!-- 隐藏输入框防止浏览器自动填充 -->
        <input type="text" style="display:none" />
        <input type="password" style="display:none" />

        <!-- 基本信息卡片 -->
        <div class="max-w-2xl bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-4">
          <h2 class="text-lg font-medium text-(--ui-text) mb-4">基本信息</h2>

          <UFormField label="配置名称" name="name" required>
            <UInput
              v-model="form.name"
              placeholder="例如：我的MJ账号"
              class="w-60"
            />
          </UFormField>

          <UFormField label="API地址" name="baseUrl" required>
            <template #hint>
              <span>无需添加 /v1 后缀，<a href="/docs/features/上游和模型配置#api-paths" target="_blank" class="text-(--ui-primary) hover:underline">查看各模型的完整请求路径</a></span>
            </template>
            <UInput
              v-model="form.baseUrl"
              type="url"
              placeholder="https://api.example.com"
              class="w-120"
            />
          </UFormField>

          <!-- API 密钥管理 -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-(--ui-text)">API 密钥 <span class="text-red-500">*</span></label>
              <UButton size="xs" variant="ghost" icon="i-heroicons-plus" @click="addApiKey">添加 Key</UButton>
            </div>

            <div v-for="(keyConfig, index) in apiKeys" :key="index" class="flex items-center gap-2 p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)">
              <UInput
                v-model="keyConfig.name"
                placeholder="Key 名称"
                class="w-32"
                size="sm"
              />
              <UInput
                v-model="keyConfig.key"
                placeholder="sk-xxx..."
                class="flex-1"
                size="sm"
              />
              <UButton
                v-if="apiKeys.length > 1"
                size="xs"
                variant="ghost"
                color="error"
                icon="i-heroicons-trash"
                @click="removeApiKey(index)"
              />
            </div>
          </div>

          <!-- 余额查询配置 -->
          <UFormField label="余额查询" name="upstreamPlatform">
            <div class="flex items-center gap-3">
              <USelect
                v-model="form.upstreamPlatform"
                :items="upstreamPlatformOptions"
                class="w-40"
                placeholder="选择类型"
              />
              <UInput
                v-if="form.upstreamPlatform"
                v-model="form.userApiKey"
                placeholder="格式：用户ID:令牌"
                class="w-80"
                required
              />
            </div>
            <template v-if="form.upstreamPlatform" #hint>
              <span class="text-xs text-(--ui-text-muted)">格式：用户ID:系统访问令牌（在平台个人中心获取）</span>
            </template>
          </UFormField>

          <UFormField label="备注" name="remark">
            <UTextarea
              v-model="form.remark"
              placeholder="添加一些说明..."
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <label class="flex items-center justify-between cursor-pointer">
            <div>
              <span class="text-(--ui-text)">禁用此上游</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">禁用后不会出现在模型选择器中，也无法用于对话/绘图/视频任务</p>
            </div>
            <UCheckbox v-model="form.disabled" />
          </label>
        </div>

        <!-- 模型配置卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-medium text-(--ui-text)">模型配置</h2>
              <UButton
                v-if="!isBatchMode"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-squares-2x2"
                @click="toggleBatchMode"
              >
                批量管理
              </UButton>
              <UButton
                v-else
                size="xs"
                variant="soft"
                color="primary"
                icon="i-heroicons-x-mark"
                @click="toggleBatchMode"
              >
                取消批量
              </UButton>
            </div>
            <div class="flex items-center gap-2">
              <USelectMenu
                v-model="groupFilter"
                :items="groupFilterOptions"
                value-key="value"
                class="w-32"
              />
              <USelectMenu
                v-model="categoryFilter"
                :items="categoryFilterOptions"
                value-key="value"
                class="w-24"
              />
              <UButton
                variant="outline"
                icon="i-heroicons-cloud-arrow-down"
                :disabled="!form.baseUrl || !apiKeys.some(k => k.key)"
                @click="showImportModal = true"
              >
                从上游导入
              </UButton>
              <UButton icon="i-heroicons-plus" @click="openAddModal">
                添加模型
              </UButton>
            </div>
          </div>

          <!-- 批量操作栏 -->
          <div v-if="isBatchMode" class="flex items-center gap-3 mb-3 p-2 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)">
            <UCheckbox
              :model-value="isAllSelected"
              @update:model-value="toggleSelectAll"
            />
            <span class="text-sm text-(--ui-text-muted)">
              已选 {{ selectedModels.size }} / {{ filteredModels.length }} 项
            </span>
            <UButton
              v-if="selectedModels.size > 0"
              size="xs"
              color="error"
              variant="soft"
              icon="i-heroicons-trash"
              @click="deleteSelectedModels"
            >
              删除选中
            </UButton>
          </div>

          <!-- 模型列表 -->
          <div v-if="aimodels.length === 0" class="text-center py-12 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-cube" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无模型配置</p>
            <p class="text-sm mt-1">点击"添加模型"或"从上游导入"开始配置</p>
          </div>

          <draggable
            v-else
            v-model="aimodels"
            :item-key="(item: AimodelInput) => item.id || item.modelName"
            handle=".drag-handle"
            ghost-class="opacity-50"
            class="space-y-1"
            @end="updateSortOrder"
          >
            <template #item="{ element: model }">
              <div
                v-show="(categoryFilter === 'all' || model.category === categoryFilter) && (groupFilter === 'all' || getModelGroup(model.modelName || model.name || '') === groupFilter)"
                class="flex items-center gap-3 p-2 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 transition-colors"
              >
                <!-- 批量选择复选框 -->
                <UCheckbox
                  v-if="isBatchMode"
                  :model-value="selectedModels.has(getModelKey(model))"
                  @update:model-value="toggleModelSelection(model)"
                  @click.stop
                />

                <!-- 拖拽手柄 -->
                <UIcon
                  v-if="!isBatchMode"
                  name="i-heroicons-bars-3"
                  class="drag-handle w-4 h-4 text-(--ui-text-dimmed) cursor-grab active:cursor-grabbing shrink-0"
                />

                <!-- 模型图标 -->
                <img
                  v-if="getModelLogo(model)"
                  :src="getModelLogo(model)"
                  class="w-5 h-5 rounded shrink-0 object-contain cursor-pointer"
                  :alt="model.name"
                  @click="openEditModal(model)"
                />
                <div
                  v-else
                  class="w-5 h-5 rounded shrink-0 bg-(--ui-bg-accented) flex items-center justify-center text-xs font-medium text-(--ui-text-muted) cursor-pointer"
                  @click="openEditModal(model)"
                >
                  {{ (model.name || model.modelName || '?')[0]?.toUpperCase() }}
                </div>

                <!-- 分类标签 -->
                <span
                  class="text-xs px-1.5 py-0.5 rounded shrink-0"
                  :class="{
                    'bg-blue-500/10 text-blue-500': model.category === 'chat',
                    'bg-purple-500/10 text-purple-500': model.category === 'image',
                    'bg-orange-500/10 text-orange-500': model.category === 'video',
                  }"
                >
                  {{ CATEGORY_LABELS[model.category as ModelCategory] }}
                </span>

                <!-- 显示名称 -->
                <span class="text-sm text-(--ui-text) truncate flex-1 cursor-pointer" @click="openEditModal(model)">
                  {{ model.name || model.modelName || '未命名' }}
                </span>

                <!-- 能力图标 -->
                <div class="flex gap-1.5 shrink-0">
                  <UIcon
                    v-for="cap in (model.capabilities || [])"
                    :key="cap"
                    :name="capabilityConfig[cap as ModelCapability]?.icon"
                    class="w-4 h-4"
                    :class="capabilityConfig[cap as ModelCapability]?.color"
                  />
                </div>

                <!-- ID 标签 -->
                <span v-if="model.id" class="text-xs text-(--ui-text-dimmed) font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded shrink-0">
                  ID:{{ model.id }}
                </span>

                <!-- 删除按钮 -->
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-heroicons-trash"
                  type="button"
                  @click.stop="removeModel(model)"
                />
              </div>
            </template>
          </draggable>
        </div>

        <!-- 删除按钮（仅编辑模式） -->
        <div v-if="!isNew" class="mt-8 pt-6 border-t border-(--ui-border)">
          <UButton
            color="error"
            variant="ghost"
            type="button"
            @click="showDeleteConfirm = true"
          >
            删除上游配置
          </UButton>
        </div>
      </UForm>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定要删除这个上游配置吗？此操作不可撤销。" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 批量删除确认弹窗 -->
    <UModal v-model:open="showDeleteConfirmBatch" title="确认批量删除" :description="`确定要删除选中的 ${selectedModels.size} 个模型吗？保存后生效。`" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDeleteSelected">删除</UButton>
          <UButton variant="outline" color="neutral" @click="showDeleteConfirmBatch = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 模型编辑模态框 -->
    <SettingsModelEditModal
      v-model:open="showEditModal"
      v-model:model="editingModel"
      :api-keys="apiKeys"
      @save="onSaveModel"
    />

    <!-- 从上游导入模态框 -->
    <SettingsRemoteModelPicker
      v-model:open="showImportModal"
      :base-url="form.baseUrl"
      :api-key="apiKeys[0]?.key || ''"
      @import="onImportModels"
    />
  </SettingsLayout>
</template>

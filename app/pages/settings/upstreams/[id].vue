<script setup lang="ts">
import type { ModelCategory, ApiKeyConfig, UpstreamPlatform, ModelCapability } from '../../../shared/types'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'
import type { AimodelInput } from '../../../composables/useUpstreams'
import { CATEGORY_LABELS } from '../../../shared/constants'
import { getModelLogo } from '../../../shared/model-logo'
import { getModelGroup } from '../../../shared/model-inference'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { upstreams, createUpstream, updateUpstream, deleteUpstream } = useUpstreams()

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

// 按 group 分组的模型列表
const groupedModels = computed(() => {
  const groups: Record<string, AimodelInput[]> = {}
  for (const model of filteredModels.value) {
    const group = getModelGroup(model.modelName || model.name || '')
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group]!.push(model)
  }
  return groups
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

onMounted(() => {
  loadUpstreamData()
})

// 打开编辑模态框（新增）
function openAddModal() {
  editingModel.value = null
  showEditModal.value = true
}

// 打开编辑模态框（编辑）
function openEditModal(model: AimodelInput) {
  editingModel.value = { ...model }
  showEditModal.value = true
}

// 保存模型（新增或更新）
function onSaveModel(model: AimodelInput) {
  if (model.id) {
    // 更新现有模型
    const index = aimodels.value.findIndex(m => m.id === model.id)
    if (index !== -1) {
      aimodels.value[index] = model
    }
  } else {
    // 新增模型
    aimodels.value.push(model)
  }
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
  aimodels.value.push(...models)
  toast.add({ title: `已导入 ${models.length} 个模型`, color: 'success' })
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
        </div>

        <!-- 模型配置卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-medium text-(--ui-text)">模型配置</h2>
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

          <!-- 模型列表 -->
          <div v-if="filteredModels.length === 0" class="text-center py-12 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-cube" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无模型配置</p>
            <p class="text-sm mt-1">点击"添加模型"或"从上游导入"开始配置</p>
          </div>

          <div v-else class="max-h-96 overflow-y-auto space-y-4">
            <div v-for="(models, group) in groupedModels" :key="group">
              <div class="text-xs font-medium text-(--ui-text-muted) mb-2 sticky top-0 bg-(--ui-bg-elevated) py-1">
                {{ group }}
              </div>
              <div class="space-y-1">
                <div
                  v-for="model in models"
                  :key="model.id || model.modelName"
                  class="flex items-center gap-3 p-2 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) hover:border-(--ui-primary)/50 cursor-pointer transition-colors"
                  @click="openEditModal(model)"
                >
                  <!-- 模型图标 -->
                  <img
                    v-if="getModelLogo(model)"
                    :src="getModelLogo(model)"
                    class="w-5 h-5 rounded shrink-0 object-contain"
                    :alt="model.name"
                  />
                  <div
                    v-else
                    class="w-5 h-5 rounded shrink-0 bg-(--ui-bg-accented) flex items-center justify-center text-xs font-medium text-(--ui-text-muted)"
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
                    {{ CATEGORY_LABELS[model.category] }}
                  </span>

                  <!-- 显示名称 -->
                  <span class="text-sm text-(--ui-text) truncate flex-1">
                    {{ model.name || model.modelName || '未命名' }}
                  </span>

                  <!-- 能力图标 -->
                  <div class="flex gap-1.5 shrink-0">
                    <UIcon
                      v-for="cap in (model.capabilities || [])"
                      :key="cap"
                      :name="capabilityConfig[cap].icon"
                      class="w-4 h-4"
                      :class="capabilityConfig[cap].color"
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
              </div>
            </div>
          </div>
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

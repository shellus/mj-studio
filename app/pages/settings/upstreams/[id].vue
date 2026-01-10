<script setup lang="ts">
import type { ModelCategory, ImageModelType, VideoModelType, ModelType, ApiFormat, ChatModelType, ApiKeyConfig, UpstreamPlatform } from '../../../shared/types'
import type { FormSubmitEvent, FormError, TabsItem } from '@nuxt/ui'
import type { AimodelInput } from '../../../composables/useUpstreams'
import {
  IMAGE_MODEL_TYPES,
  VIDEO_MODEL_TYPES,
  MODEL_API_FORMAT_OPTIONS,
  DEFAULT_MODEL_NAMES,
  DEFAULT_ESTIMATED_TIMES,
  DEFAULT_VIDEO_ESTIMATED_TIMES,
  MODEL_TYPE_LABELS,
  API_FORMAT_LABELS,
  inferChatModelType,
} from '../../../shared/constants'

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

// 绘图模型配置（使用 AimodelInput 格式）
const imageAimodels = ref<AimodelInput[]>([])

// 对话模型配置
const chatAimodels = ref<AimodelInput[]>([])

// 视频模型配置
const videoAimodels = ref<AimodelInput[]>([])

// 当前 Tab
const activeTab = ref('image')

// Tab 配置
const tabItems: TabsItem[] = [
  {
    label: '绘图模型',
    value: 'image',
    icon: 'i-heroicons-paint-brush',
    slot: 'image',
  },
  {
    label: '视频模型',
    value: 'video',
    icon: 'i-heroicons-video-camera',
    slot: 'video',
  },
  {
    label: '对话模型',
    value: 'chat',
    icon: 'i-heroicons-chat-bubble-left-right',
    slot: 'chat',
  },
]

// 表单验证
function validate(state: typeof form): FormError[] {
  const errors: FormError[] = []
  if (!state.name?.trim()) {
    errors.push({ name: 'name', message: '请输入配置名称' })
  }
  if (!state.baseUrl?.trim()) {
    errors.push({ name: 'baseUrl', message: '请输入API地址' })
  }
  // 验证至少有一个有效的 Key
  const hasValidKey = apiKeys.value.some(k => k.key?.trim())
  if (!hasValidKey) {
    errors.push({ name: 'apiKey', message: '请至少添加一个API密钥' })
  }
  // 选了余额查询类型后，userApiKey 必填
  if (state.upstreamPlatform && !state.userApiKey?.trim()) {
    errors.push({ name: 'upstreamPlatform', message: '请输入用于查询余额的 API Key' })
  }
  return errors
}

// 加载配置数据
async function loadUpstreamData() {
  // upstreams 已由插件加载，直接使用即可
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

      // 加载 apiKeys
      apiKeys.value = upstream.apiKeys

      // 分离绘图模型、视频模型和对话模型
      if (upstream.aimodels) {
        imageAimodels.value = upstream.aimodels
          .filter(m => !m.category || m.category === 'image')
          .map(m => ({
            id: m.id,  // 保留 ID
            category: 'image' as ModelCategory,
            modelType: m.modelType,
            apiFormat: m.apiFormat,
            modelName: m.modelName,
            name: m.name,  // 显示名称
            estimatedTime: m.estimatedTime,
            keyName: m.keyName,
          }))
        videoAimodels.value = upstream.aimodels
          .filter(m => m.category === 'video')
          .map(m => ({
            id: m.id,  // 保留 ID
            category: 'video' as ModelCategory,
            modelType: m.modelType,
            apiFormat: m.apiFormat,
            modelName: m.modelName,
            name: m.name,  // 显示名称
            estimatedTime: m.estimatedTime,
            keyName: m.keyName,
          }))
        chatAimodels.value = upstream.aimodels
          .filter(m => m.category === 'chat')
          .map(m => ({
            id: m.id,  // 保留 ID
            category: 'chat' as ModelCategory,
            modelType: m.modelType,
            apiFormat: m.apiFormat,
            modelName: m.modelName,
            name: m.name,  // 显示名称
            estimatedTime: m.estimatedTime,
            keyName: m.keyName,
          }))
      }
    } else {
      toast.add({ title: '配置不存在', color: 'error' })
      router.push('/settings/upstreams')
    }
  } else {
    // 新建时设置默认值
    apiKeys.value = [{ name: 'default', key: '' }]
  }
}

onMounted(() => {
  loadUpstreamData()
})

// 获取可用的请求格式
function getAvailableFormats(modelType: ModelType): ApiFormat[] {
  return MODEL_API_FORMAT_OPTIONS[modelType] || []
}

// 添加绘图模型
function addImageModel() {
  imageAimodels.value.push({
    category: 'image',
    modelType: '' as any,
    apiFormat: '' as any,
    modelName: '',
    name: '',  // 显示名称，modelType 变化时自动填充
    estimatedTime: 60,
  })
}

// 添加对话模型
function addChatModel() {
  chatAimodels.value.push({
    category: 'chat',
    modelType: 'gpt' as any, // 保留字段但使用默认值
    apiFormat: 'openai-chat' as any,
    modelName: '',
    name: '',  // 显示名称，modelName 变化时自动填充
    estimatedTime: 5, // 默认5秒
  })
}

// 添加视频模型
function addVideoModel() {
  videoAimodels.value.push({
    category: 'video',
    modelType: '' as any,
    apiFormat: '' as any,
    modelName: '',
    name: '',  // 显示名称，modelType 变化时自动填充
    estimatedTime: 120,
  })
}

// 移除模型配置
function removeImageModel(index: number) {
  imageAimodels.value.splice(index, 1)
}

function removeChatModel(index: number) {
  chatAimodels.value.splice(index, 1)
}

function removeVideoModel(index: number) {
  videoAimodels.value.splice(index, 1)
}

// 当模型类型变化时，更新默认值
function onImageModelTypeChange(index: number) {
  const aimodel = imageAimodels.value[index]
  if (!aimodel) return

  const availableFormats = getAvailableFormats(aimodel.modelType as ModelType)

  if (!availableFormats.includes(aimodel.apiFormat)) {
    aimodel.apiFormat = availableFormats[0] || 'mj-proxy'
  }

  aimodel.modelName = DEFAULT_MODEL_NAMES[aimodel.modelType as ModelType] || ''
  aimodel.name = MODEL_TYPE_LABELS[aimodel.modelType as ModelType] || ''  // 自动填充显示名称
  aimodel.estimatedTime = DEFAULT_ESTIMATED_TIMES[aimodel.modelType as ImageModelType] || 60
}

function onChatModelTypeChange(index: number) {
  const aimodel = chatAimodels.value[index]
  if (!aimodel) return

  const availableFormats = getAvailableFormats(aimodel.modelType as ModelType)

  if (!availableFormats.includes(aimodel.apiFormat)) {
    aimodel.apiFormat = availableFormats[0] || 'openai-chat'
  }

  aimodel.modelName = DEFAULT_MODEL_NAMES[aimodel.modelType as ModelType] || ''
}

function onVideoModelTypeChange(index: number) {
  const aimodel = videoAimodels.value[index]
  if (!aimodel) return

  const availableFormats = getAvailableFormats(aimodel.modelType as ModelType)

  if (!availableFormats.includes(aimodel.apiFormat)) {
    aimodel.apiFormat = availableFormats[0] || 'video-unified'
  }

  aimodel.modelName = DEFAULT_MODEL_NAMES[aimodel.modelType as ModelType] || ''
  aimodel.name = MODEL_TYPE_LABELS[aimodel.modelType as ModelType] || ''  // 自动填充显示名称
  aimodel.estimatedTime = DEFAULT_VIDEO_ESTIMATED_TIMES[aimodel.modelType as VideoModelType] || 120
}

// 获取推断的模型类型显示
function getInferredModelType(modelName: string): { type: ChatModelType | null; label: string } {
  const inferred = inferChatModelType(modelName)
  if (inferred) {
    return { type: inferred, label: MODEL_TYPE_LABELS[inferred] }
  }
  return { type: null, label: '自定义' }
}

// 当对话模型名称变化时，自动推断类型
function onChatModelNameChange(index: number) {
  const aimodel = chatAimodels.value[index]
  if (!aimodel) return

  // 自动填充 name 为 modelName（对话模型规则）
  aimodel.name = aimodel.modelName

  const inferred = inferChatModelType(aimodel.modelName)
  if (inferred) {
    aimodel.modelType = inferred
    // 确保 apiFormat 兼容
    const availableFormats = getAvailableFormats(inferred)
    if (!availableFormats.includes(aimodel.apiFormat)) {
      aimodel.apiFormat = availableFormats[0] || 'openai-chat'
    }
  }
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
  // 过滤有效的 apiKeys
  const validApiKeys = apiKeys.value.filter(k => k.key?.trim())
  if (validApiKeys.length === 0) {
    toast.add({ title: '请至少添加一个有效的 API 密钥', color: 'error' })
    return
  }

  // 合并模型配置
  const allAimodels: AimodelInput[] = [
    ...imageAimodels.value.map(m => ({ ...m, category: 'image' as ModelCategory })),
    ...videoAimodels.value.map(m => ({ ...m, category: 'video' as ModelCategory })),
    ...chatAimodels.value.map(m => ({ ...m, category: 'chat' as ModelCategory })),
  ]

  if (allAimodels.length === 0) {
    toast.add({ title: '请至少添加一种模型', color: 'error' })
    return
  }

  try {
    if (isNew.value) {
      await createUpstream({
        name: form.name,
        baseUrl: form.baseUrl,
        apiKeys: validApiKeys,
        aimodels: allAimodels,
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
        aimodels: allAimodels,
        remark: form.remark || null,
        upstreamPlatform: form.upstreamPlatform || null,
        userApiKey: form.userApiKey || null,
      })
      toast.add({ title: '配置已更新', color: 'success' })
    }
    router.back()
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
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

          <UFormField label="API地址" name="baseUrl" required hint="无需添加 /v1 后缀，MJ 绘图使用 /mj，视频接口使用 /v1/video 等路径">
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
          <h2 class="text-lg font-medium text-(--ui-text) mb-4">模型配置</h2>

          <UTabs
            v-model="activeTab"
            :items="tabItems"
            variant="pill"
            color="neutral"
            :ui="{ root: 'items-start', list: 'w-auto' }"
          >
            <!-- 绘图模型 Tab -->
            <template #image>
              <div class="pt-4">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <!-- 模型卡片列表 -->
                  <div
                    v-for="(aimodel, index) in imageAimodels"
                    :key="aimodel.id || index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-(--ui-text) truncate">
                          🎨 {{ MODEL_TYPE_LABELS[aimodel.modelType] || '未选择' }}
                        </span>
                        <span v-if="aimodel.id" class="text-xs text-(--ui-text-dimmed) font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded">
                          ID:{{ aimodel.id }}
                        </span>
                      </div>
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        type="button"
                        @click="removeImageModel(index)"
                      >
                        <UIcon name="i-heroicons-trash" class="w-4 h-4" />
                      </UButton>
                    </div>

                    <div class="space-y-2">
                      <UFormField label="模型类型">
                        <USelectMenu
                          :model-value="aimodel.modelType"
                          :items="IMAGE_MODEL_TYPES.map(t => ({ label: MODEL_TYPE_LABELS[t], value: t }))"
                          value-key="value"
                          class="w-40"
                          @update:model-value="(v: any) => { aimodel.modelType = v; onImageModelTypeChange(index) }"
                        />
                      </UFormField>

                      <UFormField label="请求格式">
                        <div class="flex flex-wrap gap-1.5">
                          <UButton
                            v-for="f in getAvailableFormats(aimodel.modelType as ModelType)"
                            :key="f"
                            size="xs"
                            :variant="aimodel.apiFormat === f ? 'solid' : 'outline'"
                            :color="aimodel.apiFormat === f ? 'primary' : 'neutral'"
                            type="button"
                            @click="aimodel.apiFormat = f"
                          >
                            {{ API_FORMAT_LABELS[f] }}
                          </UButton>
                        </div>
                      </UFormField>

                      <UFormField label="模型名称">
                        <UInput
                          v-model="aimodel.modelName"
                          :placeholder="DEFAULT_MODEL_NAMES[aimodel.modelType as ModelType] || '可选'"
                          class="w-60"
                        />
                      </UFormField>

                      <UFormField label="显示名称">
                        <UInput
                          v-model="aimodel.name"
                          placeholder="在模型选择器中显示的名称"
                          class="w-60"
                        />
                      </UFormField>

                      <UFormField label="预计时间(秒)">
                        <UInput
                          v-model.number="aimodel.estimatedTime"
                          type="number"
                          min="1"
                          class="w-24"
                        />
                      </UFormField>

                      <UFormField v-if="apiKeys.length > 1" label="使用 Key">
                        <USelectMenu
                          v-model="aimodel.keyName"
                          :items="availableKeyNames"
                          value-key="value"
                          placeholder="default"
                          class="w-32"
                        />
                      </UFormField>
                    </div>
                  </div>

                  <!-- 添加按钮卡片 -->
                  <button
                    type="button"
                    class="p-3 rounded-lg border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) hover:bg-(--ui-primary)/5 transition-colors flex flex-col items-center justify-center min-h-32 cursor-pointer"
                    @click="addImageModel"
                  >
                    <UIcon name="i-heroicons-plus" class="w-8 h-8 text-(--ui-text-muted) mb-2" />
                    <span class="text-sm text-(--ui-text-muted)">添加绘图模型</span>
                  </button>
                </div>
              </div>
            </template>

            <!-- 视频模型 Tab -->
            <template #video>
              <div class="pt-4">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <!-- 模型卡片列表 -->
                  <div
                    v-for="(aimodel, index) in videoAimodels"
                    :key="aimodel.id || index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-(--ui-text) truncate">
                          🎬 {{ MODEL_TYPE_LABELS[aimodel.modelType] || '未选择' }}
                        </span>
                        <span v-if="aimodel.id" class="text-xs text-(--ui-text-dimmed) font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded">
                          ID:{{ aimodel.id }}
                        </span>
                      </div>
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        type="button"
                        @click="removeVideoModel(index)"
                      >
                        <UIcon name="i-heroicons-trash" class="w-4 h-4" />
                      </UButton>
                    </div>

                    <div class="space-y-2">
                      <UFormField label="模型类型">
                        <USelectMenu
                          :model-value="aimodel.modelType"
                          :items="VIDEO_MODEL_TYPES.map(t => ({ label: MODEL_TYPE_LABELS[t], value: t }))"
                          value-key="value"
                          class="w-40"
                          @update:model-value="(v: any) => { aimodel.modelType = v; onVideoModelTypeChange(index) }"
                        />
                      </UFormField>

                      <UFormField label="请求格式">
                        <div class="flex flex-wrap gap-1.5">
                          <UButton
                            v-for="f in getAvailableFormats(aimodel.modelType as ModelType)"
                            :key="f"
                            size="xs"
                            :variant="aimodel.apiFormat === f ? 'solid' : 'outline'"
                            :color="aimodel.apiFormat === f ? 'primary' : 'neutral'"
                            type="button"
                            @click="aimodel.apiFormat = f"
                          >
                            {{ API_FORMAT_LABELS[f] }}
                          </UButton>
                        </div>
                      </UFormField>

                      <UFormField label="模型名称">
                        <UInput
                          v-model="aimodel.modelName"
                          :placeholder="DEFAULT_MODEL_NAMES[aimodel.modelType as ModelType] || '可选'"
                          class="w-60"
                        />
                      </UFormField>

                      <UFormField label="显示名称">
                        <UInput
                          v-model="aimodel.name"
                          placeholder="在模型选择器中显示的名称"
                          class="w-60"
                        />
                      </UFormField>

                      <UFormField label="预计时间(秒)">
                        <UInput
                          v-model.number="aimodel.estimatedTime"
                          type="number"
                          min="1"
                          class="w-24"
                        />
                      </UFormField>

                      <UFormField v-if="apiKeys.length > 1" label="使用 Key">
                        <USelectMenu
                          v-model="aimodel.keyName"
                          :items="availableKeyNames"
                          value-key="value"
                          placeholder="default"
                          class="w-32"
                        />
                      </UFormField>
                    </div>
                  </div>

                  <!-- 添加按钮卡片 -->
                  <button
                    type="button"
                    class="p-3 rounded-lg border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) hover:bg-(--ui-primary)/5 transition-colors flex flex-col items-center justify-center min-h-32 cursor-pointer"
                    @click="addVideoModel"
                  >
                    <UIcon name="i-heroicons-plus" class="w-8 h-8 text-(--ui-text-muted) mb-2" />
                    <span class="text-sm text-(--ui-text-muted)">添加视频模型</span>
                  </button>
                </div>
              </div>
            </template>

            <!-- 对话模型 Tab -->
            <template #chat>
              <div class="pt-4">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <!-- 模型卡片列表 -->
                  <div
                    v-for="(aimodel, index) in chatAimodels"
                    :key="aimodel.id || index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-(--ui-text)">💬</span>
                        <span
                          class="text-xs px-2 py-0.5 rounded-full"
                          :class="getInferredModelType(aimodel.modelName).type
                            ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
                            : 'bg-(--ui-bg-accented) text-(--ui-text-muted)'"
                        >
                          {{ getInferredModelType(aimodel.modelName).label }}
                        </span>
                        <span v-if="aimodel.id" class="text-xs text-(--ui-text-dimmed) font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded">
                          ID:{{ aimodel.id }}
                        </span>
                      </div>
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        type="button"
                        @click="removeChatModel(index)"
                      >
                        <UIcon name="i-heroicons-trash" class="w-4 h-4" />
                      </UButton>
                    </div>

                    <div class="space-y-2">
                      <!-- 请求格式选择 -->
                      <UFormField label="请求格式">
                        <div class="flex flex-wrap gap-1.5">
                          <UButton
                            v-for="f in getAvailableFormats(aimodel.modelType as ModelType)"
                            :key="f"
                            size="xs"
                            :variant="aimodel.apiFormat === f ? 'solid' : 'outline'"
                            :color="aimodel.apiFormat === f ? 'primary' : 'neutral'"
                            type="button"
                            @click="aimodel.apiFormat = f"
                          >
                            {{ API_FORMAT_LABELS[f] }}
                          </UButton>
                        </div>
                      </UFormField>

                      <!-- 模型名称输入 -->
                      <UFormField label="模型名称">
                        <UInput
                          v-model="aimodel.modelName"
                          placeholder="输入模型名称，如 gpt-4o、claude-3-opus..."
                          class="w-60"
                          @input="onChatModelNameChange(index)"
                        />
                      </UFormField>

                      <UFormField label="显示名称">
                        <UInput
                          v-model="aimodel.name"
                          placeholder="在模型选择器中显示的名称"
                          class="w-60"
                        />
                      </UFormField>

                      <UFormField label="预计时间(秒)">
                        <UInput
                          v-model.number="aimodel.estimatedTime"
                          type="number"
                          min="1"
                          class="w-24"
                        />
                      </UFormField>

                      <UFormField v-if="apiKeys.length > 1" label="使用 Key">
                        <USelectMenu
                          v-model="aimodel.keyName"
                          :items="availableKeyNames"
                          value-key="value"
                          placeholder="default"
                          class="w-32"
                        />
                      </UFormField>
                    </div>

                  </div>

                  <!-- 添加按钮卡片 -->
                  <button
                    type="button"
                    class="p-3 rounded-lg border-2 border-dashed border-(--ui-border) hover:border-(--ui-primary) hover:bg-(--ui-primary)/5 transition-colors flex flex-col items-center justify-center min-h-32 cursor-pointer"
                    @click="addChatModel"
                  >
                    <UIcon name="i-heroicons-plus" class="w-8 h-8 text-(--ui-text-muted) mb-2" />
                    <span class="text-sm text-(--ui-text-muted)">添加对话模型</span>
                  </button>
                </div>
              </div>
            </template>
          </UTabs>
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
  </SettingsLayout>
</template>

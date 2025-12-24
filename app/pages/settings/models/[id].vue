<script setup lang="ts">
import type { ModelCategory, ImageModelType, ModelType, ApiFormat, ModelTypeConfig, ChatModelType } from '../../../shared/types'
import type { FormSubmitEvent, FormError, TabsItem } from '@nuxt/ui'
import {
  IMAGE_MODEL_TYPES,
  MODEL_API_FORMAT_OPTIONS,
  MODEL_CATEGORY_MAP,
  DEFAULT_MODEL_NAMES,
  DEFAULT_ESTIMATED_TIMES,
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
const { configs, loadConfigs, createConfig, updateConfig } = useModelConfigs()

// 是否是新建模式
const isNew = computed(() => route.params.id === 'new')
const configId = computed(() => isNew.value ? null : Number(route.params.id))

// 页面标题
const pageTitle = computed(() => isNew.value ? '添加配置' : '编辑配置')

// 表单状态
const form = reactive({
  name: '',
  baseUrl: '',
  apiKey: '',
  remark: '',
  isDefault: false,
})

// 绘图模型配置
const imageModelConfigs = ref<ModelTypeConfig[]>([])

// 对话模型配置
const chatModelConfigs = ref<ModelTypeConfig[]>([])

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
  if (!state.apiKey?.trim()) {
    errors.push({ name: 'apiKey', message: '请输入API密钥' })
  }
  return errors
}

// 加载配置数据
async function loadConfigData() {
  await loadConfigs()

  if (!isNew.value && configId.value) {
    const config = configs.value.find(c => c.id === configId.value)
    if (config) {
      Object.assign(form, {
        name: config.name,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        remark: config.remark || '',
        isDefault: config.isDefault,
      })

      // 分离绘图模型和对话模型
      if (config.modelTypeConfigs) {
        imageModelConfigs.value = config.modelTypeConfigs.filter(
          (c: ModelTypeConfig) => !c.category || c.category === 'image'
        )
        chatModelConfigs.value = config.modelTypeConfigs.filter(
          (c: ModelTypeConfig) => c.category === 'chat'
        )
      }
    } else {
      toast.add({ title: '配置不存在', color: 'error' })
      router.push('/settings/models')
    }
  } else {
    // 新建时设置默认值
    form.isDefault = configs.value.length === 0
  }
}

onMounted(() => {
  loadConfigData()
})

// 获取可用的请求格式
function getAvailableFormats(modelType: ModelType): ApiFormat[] {
  return MODEL_API_FORMAT_OPTIONS[modelType] || []
}

// 添加绘图模型
function addImageModel() {
  imageModelConfigs.value.push({
    category: 'image',
    modelType: '' as any,
    apiFormat: '' as any,
    modelName: '',
    estimatedTime: 60,
  })
}

// 添加对话模型
function addChatModel() {
  chatModelConfigs.value.push({
    category: 'chat',
    modelType: 'gpt' as any, // 保留字段但使用默认值
    apiFormat: 'openai-chat' as any,
    modelName: '',
  })
}

// 移除模型配置
function removeImageModel(index: number) {
  imageModelConfigs.value.splice(index, 1)
}

function removeChatModel(index: number) {
  chatModelConfigs.value.splice(index, 1)
}

// 当模型类型变化时，更新默认值
function onImageModelTypeChange(index: number) {
  const config = imageModelConfigs.value[index]
  const availableFormats = getAvailableFormats(config.modelType as ModelType)

  if (!availableFormats.includes(config.apiFormat)) {
    config.apiFormat = availableFormats[0]
  }

  config.modelName = DEFAULT_MODEL_NAMES[config.modelType as ModelType]
  config.estimatedTime = DEFAULT_ESTIMATED_TIMES[config.modelType as ImageModelType]
}

function onChatModelTypeChange(index: number) {
  const config = chatModelConfigs.value[index]
  const availableFormats = getAvailableFormats(config.modelType as ModelType)

  if (!availableFormats.includes(config.apiFormat)) {
    config.apiFormat = availableFormats[0]
  }

  config.modelName = DEFAULT_MODEL_NAMES[config.modelType as ModelType]
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
  const config = chatModelConfigs.value[index]
  const inferred = inferChatModelType(config.modelName)
  if (inferred) {
    config.modelType = inferred
    // 确保 apiFormat 兼容
    const availableFormats = getAvailableFormats(inferred)
    if (!availableFormats.includes(config.apiFormat)) {
      config.apiFormat = availableFormats[0]
    }
  }
}

// 提交表单
async function onSubmit(event: FormSubmitEvent<typeof form>) {
  // 合并模型配置
  const allModelConfigs = [
    ...imageModelConfigs.value.map(c => ({ ...c, category: 'image' as ModelCategory })),
    ...chatModelConfigs.value.map(c => ({ ...c, category: 'chat' as ModelCategory })),
  ]

  if (allModelConfigs.length === 0) {
    toast.add({ title: '请至少添加一种模型', color: 'error' })
    return
  }

  try {
    if (isNew.value) {
      await createConfig({
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        modelTypeConfigs: allModelConfigs,
        remark: form.remark,
        isDefault: form.isDefault,
      })
      toast.add({ title: '配置已创建', color: 'success' })
    } else {
      await updateConfig(configId.value!, {
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        modelTypeConfigs: allModelConfigs,
        remark: form.remark || null,
        isDefault: form.isDefault,
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
</script>

<template>
  <div class="p-6">
      <!-- 页面标题 -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-(--ui-text)">{{ pageTitle }}</h1>
          <p class="text-(--ui-text-muted) text-sm mt-1">配置 AI 服务的连接信息和支持的模型</p>
        </div>
        <div class="flex gap-2">
          <UButton variant="outline" color="neutral" @click="router.back()">取消</UButton>
          <UButton type="submit" form="model-config-form">{{ isNew ? '创建' : '保存' }}</UButton>
        </div>
      </div>

      <!-- 表单 -->
      <UForm id="model-config-form" :state="form" :validate="validate" class="space-y-6" @submit="onSubmit">
        <!-- 基本信息卡片 -->
        <div class="max-w-2xl bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border) space-y-4">
          <h2 class="text-lg font-medium text-(--ui-text) mb-4">基本信息</h2>

          <UFormField label="配置名称" name="name" required>
            <UInput
              v-model="form.name"
              placeholder="例如：我的MJ账号"
              class="w-60"
            />
          </UFormField>

          <UFormField label="API地址" name="baseUrl" required>
            <UInput
              v-model="form.baseUrl"
              type="url"
              placeholder="https://api.example.com"
              class="w-120"
            />
          </UFormField>

          <UFormField label="API密钥" name="apiKey" required>
            <UInput
              v-model="form.apiKey"
              type="password"
              placeholder="sk-xxx..."
              class="w-full"
            />
          </UFormField>

          <UFormField label="备注" name="remark">
            <UTextarea
              v-model="form.remark"
              placeholder="添加一些说明..."
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <label class="flex items-center gap-3 cursor-pointer">
            <UCheckbox v-model="form.isDefault" />
            <span class="text-(--ui-text-muted)">设为默认配置</span>
          </label>
        </div>

        <!-- 模型配置卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border)">
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
                    v-for="(mtc, index) in imageModelConfigs"
                    :key="index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-medium text-(--ui-text) truncate">
                        🎨 {{ MODEL_TYPE_LABELS[mtc.modelType] || '未选择' }}
                      </span>
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
                          v-model="mtc.modelType"
                          :items="IMAGE_MODEL_TYPES.map(t => ({ label: MODEL_TYPE_LABELS[t], value: t }))"
                          value-key="value"
                          class="w-40"
                          @update:model-value="onImageModelTypeChange(index)"
                        />
                      </UFormField>

                      <UFormField label="请求格式">
                        <div class="flex flex-wrap gap-1.5">
                          <UButton
                            v-for="f in getAvailableFormats(mtc.modelType as ModelType)"
                            :key="f"
                            size="xs"
                            :variant="mtc.apiFormat === f ? 'solid' : 'outline'"
                            :color="mtc.apiFormat === f ? 'primary' : 'neutral'"
                            type="button"
                            @click="mtc.apiFormat = f"
                          >
                            {{ API_FORMAT_LABELS[f] }}
                          </UButton>
                        </div>
                      </UFormField>

                      <UFormField label="模型名称">
                        <UInput
                          v-model="mtc.modelName"
                          :placeholder="DEFAULT_MODEL_NAMES[mtc.modelType as ModelType] || '可选'"
                          class="w-80"
                        />
                      </UFormField>

                      <UFormField label="预计时间(秒)">
                        <UInput
                          v-model.number="mtc.estimatedTime"
                          type="number"
                          min="1"
                          class="w-24"
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

            <!-- 对话模型 Tab -->
            <template #chat>
              <div class="pt-4">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <!-- 模型卡片列表 -->
                  <div
                    v-for="(mtc, index) in chatModelConfigs"
                    :key="index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-(--ui-text)">💬</span>
                        <span
                          class="text-xs px-2 py-0.5 rounded-full"
                          :class="getInferredModelType(mtc.modelName).type
                            ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
                            : 'bg-(--ui-bg-accented) text-(--ui-text-muted)'"
                        >
                          {{ getInferredModelType(mtc.modelName).label }}
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
                            v-for="f in getAvailableFormats(mtc.modelType as ModelType)"
                            :key="f"
                            size="xs"
                            :variant="mtc.apiFormat === f ? 'solid' : 'outline'"
                            :color="mtc.apiFormat === f ? 'primary' : 'neutral'"
                            type="button"
                            @click="mtc.apiFormat = f"
                          >
                            {{ API_FORMAT_LABELS[f] }}
                          </UButton>
                        </div>
                      </UFormField>

                      <!-- 模型名称输入 -->
                      <UFormField label="模型名称">
                        <UInput
                          v-model="mtc.modelName"
                          placeholder="输入模型名称，如 gpt-4o、claude-3-opus..."
                          class="w-80"
                          @input="onChatModelNameChange(index)"
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
      </UForm>
  </div>
</template>

<script setup lang="ts">
import type { ModelCategory, ImageModelType, ModelType, ApiFormat, ModelTypeConfig, ChatModelType } from '../../shared/types'
import type { FormSubmitEvent, FormError, TabsItem } from '@nuxt/ui'
import {
  IMAGE_MODEL_TYPES,
  CHAT_MODEL_TYPES,
  MODEL_API_FORMAT_OPTIONS,
  MODEL_CATEGORY_MAP,
  DEFAULT_MODEL_NAMES,
  DEFAULT_ESTIMATED_TIMES,
  MODEL_TYPE_LABELS,
  API_FORMAT_LABELS,
  inferChatModelType,
} from '../../shared/constants'

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
      router.push('/settings')
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

// 快捷选择模型类型（对话模型）
function onChatQuickSelect(index: number, type: ChatModelType) {
  const config = chatModelConfigs.value[index]
  config.modelType = type
  config.modelName = DEFAULT_MODEL_NAMES[type]
  const availableFormats = getAvailableFormats(type)
  if (!availableFormats.includes(config.apiFormat)) {
    config.apiFormat = availableFormats[0]
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
    router.push('/settings')
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
    <div class="max-w-4xl mx-auto">
      <!-- 页面标题 -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-(--ui-text)">{{ pageTitle }}</h1>
          <p class="text-(--ui-text-muted) text-sm mt-1">配置 AI 服务的连接信息和支持的模型</p>
        </div>
        <UButton variant="ghost" color="neutral" @click="router.push('/settings')">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
          返回列表
        </UButton>
      </div>

      <!-- 表单 -->
      <UForm :state="form" :validate="validate" class="space-y-6" @submit="onSubmit">
        <!-- 基本信息卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border) space-y-4">
          <h2 class="text-lg font-medium text-(--ui-text) mb-4">基本信息</h2>

          <UFormField label="配置名称" name="name" required>
            <UInput
              v-model="form.name"
              placeholder="例如：我的MJ账号"
              class="w-full"
            />
          </UFormField>

          <UFormField label="API地址" name="baseUrl" required>
            <UInput
              v-model="form.baseUrl"
              type="url"
              placeholder="https://api.example.com"
              class="w-full"
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

          <UTabs v-model="activeTab" :items="tabItems" class="w-full">
            <!-- 绘图模型 Tab -->
            <template #image>
              <div class="pt-4 space-y-4">
                <div class="flex justify-end">
                  <UButton size="sm" variant="ghost" type="button" @click="addImageModel">
                    <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
                    添加绘图模型
                  </UButton>
                </div>

                <div v-if="imageModelConfigs.length === 0" class="text-center py-8">
                  <UIcon name="i-heroicons-paint-brush" class="w-12 h-12 text-(--ui-text-dimmed)/50 mx-auto mb-2" />
                  <p class="text-(--ui-text-muted) text-sm">暂无绘图模型，点击上方按钮添加</p>
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="(mtc, index) in imageModelConfigs"
                    :key="index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-medium text-(--ui-text)">
                        #{{ index + 1 }} 🎨 {{ MODEL_TYPE_LABELS[mtc.modelType] || mtc.modelType || '未选择' }}
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

                    <div class="grid grid-cols-2 gap-2">
                      <UFormField label="模型类型">
                        <USelectMenu
                          v-model="mtc.modelType"
                          :items="IMAGE_MODEL_TYPES.map(t => ({ label: MODEL_TYPE_LABELS[t], value: t }))"
                          value-key="value"
                          class="w-full"
                          @update:model-value="onImageModelTypeChange(index)"
                        />
                      </UFormField>

                      <UFormField label="请求格式">
                        <USelectMenu
                          v-model="mtc.apiFormat"
                          :items="getAvailableFormats(mtc.modelType as ModelType).map(f => ({ label: API_FORMAT_LABELS[f], value: f }))"
                          value-key="value"
                          class="w-full"
                        />
                      </UFormField>
                    </div>

                    <div class="grid grid-cols-2 gap-2 mt-2">
                      <UFormField label="模型名称" help="不同中转站可能不同">
                        <UInput
                          v-model="mtc.modelName"
                          :placeholder="DEFAULT_MODEL_NAMES[mtc.modelType as ModelType] || '可选'"
                          class="w-full"
                        />
                      </UFormField>

                      <UFormField label="预计生成时间（秒）">
                        <UInput
                          v-model.number="mtc.estimatedTime"
                          type="number"
                          min="1"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 对话模型 Tab -->
            <template #chat>
              <div class="pt-4 space-y-4">
                <!-- 提示说明 -->
                <div class="text-sm text-(--ui-text-muted) bg-(--ui-bg-muted) rounded-lg p-3">
                  <p>输入模型名称后会自动识别模型类型，也可点击快捷按钮快速填入推荐模型。</p>
                  <p class="mt-1 text-xs text-(--ui-text-dimmed)">模型类型仅用于标识，不影响实际调用。未识别的模型名称将标记为"自定义"。</p>
                </div>

                <div class="flex justify-end">
                  <UButton size="sm" variant="ghost" type="button" @click="addChatModel">
                    <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
                    添加对话模型
                  </UButton>
                </div>

                <div v-if="chatModelConfigs.length === 0" class="text-center py-8">
                  <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 text-(--ui-text-dimmed)/50 mx-auto mb-2" />
                  <p class="text-(--ui-text-muted) text-sm">暂无对话模型，点击上方按钮添加</p>
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="(mtc, index) in chatModelConfigs"
                    :key="index"
                    class="p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
                  >
                    <div class="flex items-center justify-between mb-3">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-(--ui-text)">
                          #{{ index + 1 }} 💬
                        </span>
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

                    <!-- 快捷选择按钮 -->
                    <div class="mb-3">
                      <span class="text-xs text-(--ui-text-muted) mb-1.5 block">快捷选择</span>
                      <div class="flex flex-wrap gap-1.5">
                        <UButton
                          v-for="type in CHAT_MODEL_TYPES"
                          :key="type"
                          size="xs"
                          :variant="mtc.modelType === type ? 'solid' : 'outline'"
                          :color="mtc.modelType === type ? 'primary' : 'neutral'"
                          type="button"
                          @click="onChatQuickSelect(index, type)"
                        >
                          {{ MODEL_TYPE_LABELS[type] }}
                        </UButton>
                      </div>
                    </div>

                    <!-- 模型名称输入 -->
                    <UFormField label="模型名称" class="mb-2">
                      <UInput
                        v-model="mtc.modelName"
                        placeholder="输入模型名称，如 gpt-4o、claude-3-opus..."
                        class="w-full"
                        @input="onChatModelNameChange(index)"
                      />
                    </UFormField>

                    <!-- 请求格式（隐藏，因为对话模型目前都是 openai-chat） -->
                    <input type="hidden" :value="mtc.apiFormat" />
                  </div>
                </div>
              </div>
            </template>
          </UTabs>
        </div>

        <!-- 提交按钮 -->
        <div class="flex gap-3">
          <UButton type="submit" class="flex-1" size="lg">
            {{ isNew ? '创建配置' : '保存修改' }}
          </UButton>
          <UButton type="button" variant="outline" color="neutral" class="flex-1" size="lg" @click="router.push('/settings')">
            取消
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>

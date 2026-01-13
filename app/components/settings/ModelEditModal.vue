<script setup lang="ts">
import type { ModelCategory, ModelType, ApiFormat, ModelCapability, ApiKeyConfig } from '../../shared/types'
import type { AimodelInput } from '../../composables/useUpstreams'
import {
  IMAGE_MODEL_REGISTRY,
  VIDEO_MODEL_REGISTRY,
  getApiFormatsForModelType,
  getModelTypeLabel,
  getApiFormatLabel,
  getModelTypeDefaults,
} from '../../shared/registry'
import { inferChatModelType, MODEL_CATEGORY_OPTIONS } from '../../shared/constants'

const props = defineProps<{
  apiKeys: ApiKeyConfig[]
}>()

const emit = defineEmits<{
  save: [model: AimodelInput]
}>()

const open = defineModel<boolean>('open', { default: false })
const editingModel = defineModel<AimodelInput | null>('model', { default: null })

// 表单数据
const form = reactive<AimodelInput>({
  category: 'chat',
  modelType: 'gpt',
  apiFormat: 'openai-chat',
  modelName: '',
  name: '',
  capabilities: [],
  estimatedTime: 60,
  keyName: 'default',
})

// 监听编辑模型变化
watch(editingModel, (model) => {
  if (model) {
    Object.assign(form, {
      id: model.id,
      category: model.category,
      modelType: model.modelType,
      apiFormat: model.apiFormat,
      modelName: model.modelName,
      name: model.name,
      capabilities: model.capabilities || [],
      estimatedTime: model.estimatedTime || 60,
      keyName: model.keyName || 'default',
    })
  } else {
    // 重置表单
    Object.assign(form, {
      id: undefined,
      category: 'chat',
      modelType: 'gpt',
      apiFormat: 'openai-chat',
      modelName: '',
      name: '',
      capabilities: [],
      estimatedTime: 60,
      keyName: 'default',
    })
  }
}, { immediate: true })

// 是否编辑模式
const isEdit = computed(() => !!editingModel.value?.id)

// 模态框标题
const modalTitle = computed(() => isEdit.value ? '编辑模型' : '添加模型')

// 可用的 Key 名称列表
const availableKeyNames = computed(() => {
  return props.apiKeys.map(k => ({ label: k.name, value: k.name }))
})

// 获取可用的请求格式
function getAvailableFormats(modelType: ModelType): ApiFormat[] {
  return getApiFormatsForModelType(modelType) as ApiFormat[]
}

// 分类变化时重置相关字段
function onCategoryChange() {
  if (form.category === 'image') {
    form.modelType = 'midjourney'
    form.apiFormat = 'mj-proxy'
    form.estimatedTime = 60
  } else if (form.category === 'video') {
    form.modelType = 'jimeng-video'
    form.apiFormat = 'video-unified'
    form.estimatedTime = 120
  } else {
    form.modelType = 'gpt'
    form.apiFormat = 'openai-chat'
    form.estimatedTime = 5
  }
  form.modelName = ''
  form.name = ''
  form.capabilities = []
}

// 模型类型变化时更新默认值
function onModelTypeChange() {
  const availableFormats = getAvailableFormats(form.modelType)
  if (!availableFormats.includes(form.apiFormat)) {
    form.apiFormat = availableFormats[0] || 'openai-chat'
  }

  const defaults = getModelTypeDefaults(form.modelType)
  if (defaults) {
    form.modelName = defaults.modelName || ''
    form.estimatedTime = defaults.estimatedTime || 60
  }
  form.name = getModelTypeLabel(form.modelType) || ''
}

// 监听对话模型名称变化，自动推断类型（不改变 API 格式）
watch(() => form.modelName, (newName) => {
  if (form.category !== 'chat') return

  form.name = newName
  const inferred = inferChatModelType(newName)
  if (inferred) {
    form.modelType = inferred
    // 不自动更改 apiFormat，让用户手动选择
  }
})

// 能力选项
const capabilityOptions: { label: string; value: ModelCapability; icon: string }[] = [
  { label: '视觉', value: 'vision', icon: 'i-heroicons-eye' },
  { label: '推理', value: 'reasoning', icon: 'i-heroicons-light-bulb' },
  { label: '工具', value: 'function_calling', icon: 'i-heroicons-wrench' },
  { label: '联网', value: 'web_search', icon: 'i-heroicons-globe-alt' },
]

// 切换能力
function toggleCapability(cap: ModelCapability) {
  const index = form.capabilities?.indexOf(cap) ?? -1
  if (index === -1) {
    form.capabilities = [...(form.capabilities || []), cap]
  } else {
    form.capabilities = form.capabilities?.filter(c => c !== cap) || []
  }
}

// 保存
function onSave() {
  emit('save', { ...form })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <!-- 分类 -->
        <UFormField label="分类">
          <USelectMenu
            v-model="form.category"
            :items="MODEL_CATEGORY_OPTIONS"
            value-key="value"
            class="w-32"
            @update:model-value="onCategoryChange"
          />
        </UFormField>

        <!-- 模型类型（绘图/视频） -->
        <UFormField v-if="form.category === 'image'" label="模型类型">
          <USelectMenu
            v-model="form.modelType"
            :items="IMAGE_MODEL_REGISTRY.map(m => ({ label: m.label, value: m.type }))"
            value-key="value"
            class="w-48"
            @update:model-value="onModelTypeChange"
          />
        </UFormField>

        <UFormField v-if="form.category === 'video'" label="模型类型">
          <USelectMenu
            v-model="form.modelType"
            :items="VIDEO_MODEL_REGISTRY.map(m => ({ label: m.label, value: m.type }))"
            value-key="value"
            class="w-48"
            @update:model-value="onModelTypeChange"
          />
        </UFormField>

        <!-- API 格式 -->
        <UFormField label="API 格式">
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="f in getAvailableFormats(form.modelType)"
              :key="f"
              size="xs"
              :variant="form.apiFormat === f ? 'solid' : 'outline'"
              :color="form.apiFormat === f ? 'primary' : 'neutral'"
              type="button"
              @click="form.apiFormat = f"
            >
              {{ getApiFormatLabel(f) }}
            </UButton>
          </div>
        </UFormField>

        <!-- 模型名称 -->
        <UFormField label="模型名称" :hint="form.category === 'chat' ? '输入后自动推断类型' : ''">
          <UInput
            v-model="form.modelName"
            :placeholder="form.category === 'chat' ? 'gpt-4o, claude-3-opus...' : '可选'"
            class="w-full"
          />
        </UFormField>

        <!-- 显示名称 -->
        <UFormField label="显示名称">
          <UInput
            v-model="form.name"
            placeholder="在模型选择器中显示的名称"
            class="w-full"
          />
        </UFormField>

        <!-- 模型能力（仅对话模型） -->
        <UFormField v-if="form.category === 'chat'" label="模型能力">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="cap in capabilityOptions"
              :key="cap.value"
              size="sm"
              :variant="form.capabilities?.includes(cap.value) ? 'solid' : 'outline'"
              :color="form.capabilities?.includes(cap.value) ? 'primary' : 'neutral'"
              type="button"
              @click="toggleCapability(cap.value)"
            >
              <UIcon :name="cap.icon" class="w-4 h-4 mr-1" />
              {{ cap.label }}
            </UButton>
          </div>
        </UFormField>

        <!-- 预计时间 -->
        <UFormField label="预计时间（秒）">
          <UInput
            v-model.number="form.estimatedTime"
            type="number"
            min="1"
            class="w-24"
          />
        </UFormField>

        <!-- 使用的 Key -->
        <UFormField v-if="apiKeys.length > 1" label="使用的 Key">
          <USelectMenu
            v-model="form.keyName"
            :items="availableKeyNames"
            value-key="value"
            placeholder="default"
            class="w-40"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="outline" color="neutral" @click="open = false">取消</UButton>
        <UButton @click="onSave">保存</UButton>
      </div>
    </template>
  </UModal>
</template>

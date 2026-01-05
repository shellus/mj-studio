<script setup lang="ts">
import { USER_SETTING_KEYS } from '../../shared/constants'
import type { ImageModelType } from '../../shared/types'

const { settings, isLoading, isLoaded, loadSettings, updateSettings } = useUserSettings()
const { upstreams, loadUpstreams } = useUpstreams()
const toast = useToast()

// 表单状态
const form = reactive({
  blurByDefault: true,
  compressKeepCount: 4,
  titleMaxLength: 30,
  suggestionsCount: 5,
  // 绘图设置
  aiOptimizeUpstreamId: 0,
  aiOptimizeAimodelId: 0,
  aiOptimizeModelName: '',
  embeddedUpstreamId: 0,
  embeddedAimodelId: 0,
  workbenchUpstreamId: 0,
  workbenchAimodelId: 0,
})

// 保存状态
const isSaving = ref(false)

// 加载设置
onMounted(async () => {
  await Promise.all([
    !isLoaded.value ? loadSettings() : Promise.resolve(),
    loadUpstreams(),
  ])
  syncFormFromSettings()
})

// 同步设置到表单
function syncFormFromSettings() {
  form.blurByDefault = settings.value[USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT] ?? true
  form.compressKeepCount = settings.value[USER_SETTING_KEYS.GENERAL_COMPRESS_KEEP_COUNT] ?? 4
  form.titleMaxLength = settings.value[USER_SETTING_KEYS.GENERAL_TITLE_MAX_LENGTH] ?? 30
  form.suggestionsCount = settings.value[USER_SETTING_KEYS.GENERAL_SUGGESTIONS_COUNT] ?? 5
  // 绘图设置
  form.aiOptimizeUpstreamId = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_UPSTREAM_ID] ?? 0
  form.aiOptimizeAimodelId = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID] ?? 0
  form.aiOptimizeModelName = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_MODEL_NAME] ?? ''
  form.embeddedUpstreamId = settings.value[USER_SETTING_KEYS.DRAWING_EMBEDDED_UPSTREAM_ID] ?? 0
  form.embeddedAimodelId = settings.value[USER_SETTING_KEYS.DRAWING_EMBEDDED_AIMODEL_ID] ?? 0
  form.workbenchUpstreamId = settings.value[USER_SETTING_KEYS.DRAWING_WORKBENCH_UPSTREAM_ID] ?? 0
  form.workbenchAimodelId = settings.value[USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID] ?? 0
}

// 保存设置
async function saveSettings() {
  isSaving.value = true
  try {
    await updateSettings({
      [USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT]: form.blurByDefault,
      [USER_SETTING_KEYS.GENERAL_COMPRESS_KEEP_COUNT]: form.compressKeepCount,
      [USER_SETTING_KEYS.GENERAL_TITLE_MAX_LENGTH]: form.titleMaxLength,
      [USER_SETTING_KEYS.GENERAL_SUGGESTIONS_COUNT]: form.suggestionsCount,
      // 绘图设置
      [USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_UPSTREAM_ID]: form.aiOptimizeUpstreamId,
      [USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID]: form.aiOptimizeAimodelId,
      [USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_MODEL_NAME]: form.aiOptimizeModelName,
      [USER_SETTING_KEYS.DRAWING_EMBEDDED_UPSTREAM_ID]: form.embeddedUpstreamId,
      [USER_SETTING_KEYS.DRAWING_EMBEDDED_AIMODEL_ID]: form.embeddedAimodelId,
      [USER_SETTING_KEYS.DRAWING_WORKBENCH_UPSTREAM_ID]: form.workbenchUpstreamId,
      [USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID]: form.workbenchAimodelId,
    })
    toast.add({ title: '设置已保存', color: 'success' })
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error.message, color: 'error' })
  } finally {
    isSaving.value = false
  }
}

// AI 优化模型选择（对话模型）
const aiOptimizeUpstreamId = computed({
  get: () => form.aiOptimizeUpstreamId || null,
  set: (val: number | null) => { form.aiOptimizeUpstreamId = val || 0 },
})
const aiOptimizeAimodelId = computed({
  get: () => form.aiOptimizeAimodelId || null,
  set: (val: number | null) => {
    form.aiOptimizeAimodelId = val || 0
    // 更新 modelName
    if (val && form.aiOptimizeUpstreamId) {
      const upstream = upstreams.value.find(u => u.id === form.aiOptimizeUpstreamId)
      const aimodel = upstream?.aimodels?.find(m => m.id === val)
      form.aiOptimizeModelName = aimodel?.modelName || ''
    } else {
      form.aiOptimizeModelName = ''
    }
  },
})

// 嵌入式绘画模型选择（绘图模型）
const embeddedUpstreamId = computed({
  get: () => form.embeddedUpstreamId || null,
  set: (val: number | null) => { form.embeddedUpstreamId = val || 0 },
})
const embeddedAimodelId = computed({
  get: () => form.embeddedAimodelId || null,
  set: (val: number | null) => { form.embeddedAimodelId = val || 0 },
})

// 工作台默认模型选择（绘图模型）
const workbenchUpstreamId = computed({
  get: () => form.workbenchUpstreamId || null,
  set: (val: number | null) => { form.workbenchUpstreamId = val || 0 },
})
const workbenchAimodelId = computed({
  get: () => form.workbenchAimodelId || null,
  set: (val: number | null) => { form.workbenchAimodelId = val || 0 },
})
</script>

<template>
  <SettingsLayout>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium text-(--ui-text)">通用设置</h2>
      <UButton :loading="isSaving" @click="saveSettings">保存</UButton>
    </div>

    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <div v-else class="space-y-4">
      <!-- 绘图设置 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <h3 class="text-base font-medium text-(--ui-text) mb-4">绘图</h3>
        <div class="space-y-4">
          <label class="flex items-center justify-between cursor-pointer">
            <div>
              <span class="text-(--ui-text)">生图默认模糊</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">新生成的图片默认显示模糊效果</p>
            </div>
            <UCheckbox v-model="form.blurByDefault" />
          </label>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">AI 优化提示词模型</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">用于优化绘图提示词的对话模型</p>
            </div>
            <ModelSelector
              :upstreams="upstreams"
              category="chat"
              list-layout
              no-auto-select
              align-right
              v-model:upstream-id="aiOptimizeUpstreamId"
              v-model:aimodel-id="aiOptimizeAimodelId"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">嵌入式绘画默认模型</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">对话中嵌入式绘画的默认模型</p>
            </div>
            <ModelSelector
              :upstreams="upstreams"
              category="image"
              no-auto-select
              align-right
              v-model:upstream-id="embeddedUpstreamId"
              v-model:aimodel-id="embeddedAimodelId"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">工作台默认模型</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">绘图工作台的默认选择</p>
            </div>
            <ModelSelector
              :upstreams="upstreams"
              category="image"
              no-auto-select
              align-right
              v-model:upstream-id="workbenchUpstreamId"
              v-model:aimodel-id="workbenchAimodelId"
            />
          </div>
        </div>
      </div>

      <!-- 对话设置 -->
      <div class="bg-(--ui-bg-elevated) rounded-lg p-4 border border-(--ui-border)">
        <h3 class="font-medium text-(--ui-text) mb-4">对话</h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">压缩保留消息数</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">压缩时保留最近的消息条数</p>
            </div>
            <UInput v-model.number="form.compressKeepCount" type="number" min="2" max="10" class="w-20" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">标题最大长度</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">自动生成标题的最大字符数</p>
            </div>
            <UInput v-model.number="form.titleMaxLength" type="number" min="10" max="50" class="w-20" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-(--ui-text)">开场白建议数量</span>
              <p class="text-xs text-(--ui-text-muted) mt-1">新对话时生成的建议条数</p>
            </div>
            <UInput v-model.number="form.suggestionsCount" type="number" min="3" max="10" class="w-20" />
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

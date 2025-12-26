<script setup lang="ts">
import {
  USER_SETTING_KEYS,
  DEFAULT_COMPRESS_PROMPT,
  DEFAULT_GENERATE_TITLE_PROMPT,
  DEFAULT_SUGGESTIONS_PROMPT,
} from '../../shared/constants'

const { settings, isLoading, isLoaded, loadSettings, updateSettings } = useUserSettings()
const toast = useToast()

// 表单状态
const form = reactive({
  compressPrompt: '',
  generateTitlePrompt: '',
  suggestionsPrompt: '',
})

// 保存状态
const isSaving = ref(false)

// 加载设置
onMounted(async () => {
  if (!isLoaded.value) {
    await loadSettings()
  }
  syncFormFromSettings()
})

// 同步设置到表单
function syncFormFromSettings() {
  form.compressPrompt = settings.value[USER_SETTING_KEYS.PROMPT_COMPRESS] || ''
  form.generateTitlePrompt = settings.value[USER_SETTING_KEYS.PROMPT_GENERATE_TITLE] || ''
  form.suggestionsPrompt = settings.value[USER_SETTING_KEYS.PROMPT_SUGGESTIONS] || ''
}

// 保存设置
async function saveSettings() {
  isSaving.value = true
  try {
    await updateSettings({
      [USER_SETTING_KEYS.PROMPT_COMPRESS]: form.compressPrompt,
      [USER_SETTING_KEYS.PROMPT_GENERATE_TITLE]: form.generateTitlePrompt,
      [USER_SETTING_KEYS.PROMPT_SUGGESTIONS]: form.suggestionsPrompt,
    })
    toast.add({ title: '设置已保存', color: 'success' })
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error.message, color: 'error' })
  } finally {
    isSaving.value = false
  }
}

// 恢复默认
function resetToDefault(field: 'compress' | 'title' | 'suggestions') {
  switch (field) {
    case 'compress':
      form.compressPrompt = DEFAULT_COMPRESS_PROMPT
      break
    case 'title':
      form.generateTitlePrompt = DEFAULT_GENERATE_TITLE_PROMPT
      break
    case 'suggestions':
      form.suggestionsPrompt = DEFAULT_SUGGESTIONS_PROMPT
      break
  }
}
</script>

<template>
  <SettingsLayout>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium text-(--ui-text)">Prompt 设置</h2>
      <UButton :loading="isSaving" @click="saveSettings">保存</UButton>
    </div>

    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <div v-else class="space-y-6">
      <!-- 对话压缩 Prompt -->
      <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-base font-medium text-(--ui-text)">对话压缩</h3>
            <p class="text-xs text-(--ui-text-muted) mt-1">当对话过长时，用于压缩历史消息为摘要</p>
          </div>
          <UButton size="xs" variant="ghost" color="neutral" @click="resetToDefault('compress')">
            恢复默认
          </UButton>
        </div>
        <UTextarea v-model="form.compressPrompt" :rows="8" class="w-full" />
        <div class="mt-2 p-2 rounded bg-(--ui-bg-muted) text-xs text-(--ui-text-muted)">
          <p class="font-medium mb-1">可用占位符：</p>
          <p><code class="px-1 py-0.5 rounded bg-(--ui-bg-accented)">{messages}</code> - 待压缩的历史消息内容</p>
        </div>
      </div>

      <!-- 标题生成 Prompt -->
      <div class="bg-(--ui-bg-elevated) rounded-xl p-4 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-medium text-(--ui-text)">标题生成</h3>
            <p class="text-xs text-(--ui-text-muted) mt-1">用于自动生成对话标题</p>
          </div>
          <UButton size="xs" variant="ghost" color="neutral" @click="resetToDefault('title')">
            恢复默认
          </UButton>
        </div>
        <UTextarea v-model="form.generateTitlePrompt" :rows="3" class="w-full" />
        <div class="mt-2 p-2 rounded bg-(--ui-bg-muted) text-xs text-(--ui-text-muted)">
          <p class="font-medium mb-1">可用占位符：</p>
          <p><code class="px-1 py-0.5 rounded bg-(--ui-bg-accented)">{context}</code> - 对话上下文（前2条+后2条消息）</p>
        </div>
      </div>

      <!-- 开场白建议 Prompt -->
      <div class="bg-(--ui-bg-elevated) rounded-xl p-4 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-medium text-(--ui-text)">开场白建议</h3>
            <p class="text-xs text-(--ui-text-muted) mt-1">新对话时生成开场白建议</p>
          </div>
          <UButton size="xs" variant="ghost" color="neutral" @click="resetToDefault('suggestions')">
            恢复默认
          </UButton>
        </div>
        <UTextarea v-model="form.suggestionsPrompt" :rows="8" class="w-full" />
        <div class="mt-2 p-2 rounded bg-(--ui-bg-muted) text-xs text-(--ui-text-muted)">
          <p class="font-medium mb-1">可用占位符：</p>
          <p><code class="px-1 py-0.5 rounded bg-(--ui-bg-accented)">{time}</code> - 当前时间（格式：2025年12月26日星期四 15:30）</p>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

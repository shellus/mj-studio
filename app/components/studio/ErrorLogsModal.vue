<script setup lang="ts">
const props = defineProps<{
  taskId: number
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

const errorLogs = ref<{ requests: any[]; responses: any[] } | null>(null)
const loading = ref(false)

// 打开时加载日志
watch(open, async (isOpen) => {
  if (isOpen && !errorLogs.value) {
    loading.value = true
    try {
      const logs = await $fetch<{ requests: any[]; responses: any[] }>(`/api/tasks/${props.taskId}/logs`)
      errorLogs.value = logs
    } catch (error: any) {
      if (error?.statusCode === 404) {
        errorLogs.value = null
        toast.add({ title: '无详情', description: '此错误无响应日志', color: 'warning' })
        open.value = false
      }
    } finally {
      loading.value = false
    }
  }
})

// taskId 变化时重置
watch(() => props.taskId, () => {
  errorLogs.value = null
})
</script>

<template>
  <UModal v-model:open="open" title="错误详情" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <!-- 加载中 -->
      <div v-if="loading" class="text-center py-8">
        <StudioLoader class="w-8 h-8 mx-auto mb-2 text-(--ui-primary)" />
        <p class="text-(--ui-text-muted) text-sm">加载中...</p>
      </div>

      <!-- 日志内容 -->
      <div v-else-if="errorLogs" class="space-y-4 max-h-[70vh] overflow-y-auto">
        <!-- 遍历所有请求/响应对 -->
        <div v-for="(response, index) in errorLogs.responses" :key="index" class="space-y-3">
          <h4 class="text-sm font-medium text-(--ui-text-muted)">
            请求 {{ index + 1 }} / {{ errorLogs.responses.length }}
            <span class="text-xs text-(--ui-text-dimmed) ml-2">{{ response.timestamp }}</span>
          </h4>

          <!-- 请求信息 -->
          <div v-if="errorLogs.requests[index]" class="bg-(--ui-bg-muted) rounded-lg p-3 space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="font-mono text-(--ui-info)">{{ errorLogs.requests[index].method }}</span>
              <span class="font-mono text-(--ui-text) text-xs break-all">{{ errorLogs.requests[index].url }}</span>
            </div>
          </div>

          <!-- 响应信息 -->
          <div class="bg-(--ui-bg-muted) rounded-lg p-3 space-y-3">
            <!-- 状态码 -->
            <div class="flex items-center gap-2 text-sm">
              <span class="text-(--ui-text-muted)">状态码</span>
              <span
                class="font-mono font-medium"
                :class="response.status >= 400 ? 'text-(--ui-error)' : 'text-(--ui-success)'"
              >
                {{ response.status }} {{ response.statusText }}
              </span>
            </div>
            <!-- 响应体 -->
            <div>
              <span class="text-(--ui-text-muted) text-sm block mb-1">响应内容</span>
              <pre class="bg-(--ui-bg) rounded p-2 text-xs overflow-x-auto max-h-48 text-(--ui-text)">{{ JSON.stringify(response.data, null, 2) }}</pre>
            </div>
          </div>

          <!-- 分隔线 -->
          <hr v-if="index < errorLogs.responses.length - 1" class="border-(--ui-border)" />
        </div>
      </div>

      <!-- 无日志 -->
      <div v-else class="text-center py-8">
        <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 mx-auto mb-2 text-(--ui-text-dimmed)" />
        <p class="text-(--ui-text-muted) text-sm">无日志记录</p>
      </div>
    </template>
  </UModal>
</template>

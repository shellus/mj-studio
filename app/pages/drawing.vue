<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { addTask, cleanup, loadTasks } = useTasks()
const { configs: modelConfigs, loadConfigs } = useModelConfigs()
const toast = useToast()

// DrawingPanel 组件引用
const drawingPanelRef = ref<{ setContent: (prompt: string | null, negativePrompt: string | null, images: string[]) => void } | null>(null)

// 页面加载时获取数据
onMounted(() => {
  loadTasks()
  loadConfigs()
})

async function handleSubmit(prompt: string, negativePrompt: string, images: string[], modelConfigId: number, modelType: string, apiFormat: string, modelName: string) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        prompt,
        negativePrompt,
        base64Array: images,
        type: images.length > 0 && !prompt ? 'blend' : 'imagine',
        modelConfigId,
        modelType,
        apiFormat,
        modelName,
      },
    })

    if (result.success && result.taskId) {
      await addTask(result.taskId)
      toast.add({
        title: '任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 复制任务内容到工作台
function handleCopyToPanel(prompt: string | null, negativePrompt: string | null, images: string[]) {
  drawingPanelRef.value?.setContent(prompt, negativePrompt, images)
  toast.add({
    title: '已复制到工作台',
    color: 'success',
  })
}

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)] flex overflow-hidden">
    <!-- 左侧：绘图面板 -->
    <div class="w-[380px] flex-shrink-0 overflow-y-auto border-r border-(--ui-border) p-4">
      <DrawingWorkbench ref="drawingPanelRef" :model-configs="modelConfigs" @submit="handleSubmit" />
    </div>

    <!-- 右侧：任务列表 -->
    <div class="flex-1 overflow-y-auto p-4">
      <DrawingList @copy-to-panel="handleCopyToPanel" />
    </div>
  </div>
</template>

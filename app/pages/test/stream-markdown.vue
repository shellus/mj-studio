<script setup lang="ts">
/**
 * 流式 Markdown 渲染测试页面
 *
 * 模拟 AI 流式输出，逐块追加内容，验证分块渲染效果
 */

definePageMeta({
  layout: false,
})

// 测试用的 Markdown 内容（分块）
const testChunks = [
  '# 流式渲染测试\n\n',
  '这是第一段文字，用于测试流式渲染效果。',
  '当内容逐步追加时，**已完成的块不应该重新渲染**。\n\n',
  '## 代码示例\n\n',
  '下面是一段 JavaScript 代码：\n\n',
  '```javascript\n',
  'function fibonacci(n) {\n',
  '  if (n <= 1) return n;\n',
  '  return fibonacci(n - 1) + fibonacci(n - 2);\n',
  '}\n\n',
  'console.log(fibonacci(10));\n',
  '```\n\n',
  '## 列表测试\n\n',
  '下面是一个无序列表：\n\n',
  '- 第一项：分块渲染\n',
  '- 第二项：增量更新\n',
  '- 第三项：性能优化\n\n',
  '## 表格测试\n\n',
  '| 方案 | 优点 | 缺点 |\n',
  '|------|------|------|\n',
  '| 分块渲染 | 性能最优 | 实现复杂 |\n',
  '| 全量渲染 | 简单 | 性能差 |\n\n',
  '## 引用测试\n\n',
  '> 这是一段引用文字。\n',
  '> 引用可以跨多行。\n\n',
  '---\n\n',
  '**测试完成！** 你可以尝试选中上面的文字，观察是否能够正常复制。\n',
]

// 当前累积的内容
const content = ref('')

// 是否正在流式输出
const isStreaming = ref(false)

// 当前输出到第几块
const currentChunkIndex = ref(0)

// 输出速度（毫秒）
const outputSpeed = ref(100)

// 定时器
let timer: ReturnType<typeof setInterval> | null = null

// 开始流式输出
function startStreaming() {
  if (isStreaming.value) return

  content.value = ''
  currentChunkIndex.value = 0
  isStreaming.value = true

  timer = setInterval(() => {
    if (currentChunkIndex.value >= testChunks.length) {
      stopStreaming()
      return
    }

    content.value += testChunks[currentChunkIndex.value]
    currentChunkIndex.value++
  }, outputSpeed.value)
}

// 停止输出
function stopStreaming() {
  isStreaming.value = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// 重置
function reset() {
  stopStreaming()
  content.value = ''
  currentChunkIndex.value = 0
}

// 一次性输出全部
function outputAll() {
  stopStreaming()
  content.value = testChunks.join('')
  currentChunkIndex.value = testChunks.length
}

// 页面卸载时清理
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <div class="max-w-4xl mx-auto p-6">
      <h1 class="text-2xl font-bold mb-6">流式 Markdown 分块渲染测试</h1>

      <!-- 控制面板 -->
      <div class="mb-6 p-4 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border) space-y-4">
        <div class="flex items-center gap-4">
          <button
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            :disabled="isStreaming"
            @click="startStreaming"
          >
            开始流式输出
          </button>
          <button
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            :disabled="!isStreaming"
            @click="stopStreaming"
          >
            停止
          </button>
          <button
            class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            @click="reset"
          >
            重置
          </button>
          <button
            class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            @click="outputAll"
          >
            一次性输出全部
          </button>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2">
            <span>输出速度:</span>
            <input
              v-model.number="outputSpeed"
              type="range"
              min="20"
              max="500"
              step="10"
              class="w-40"
            />
            <span class="w-16 text-sm">{{ outputSpeed }}ms</span>
          </label>
          <span class="text-sm text-gray-500">
            进度: {{ currentChunkIndex }} / {{ testChunks.length }}
          </span>
        </div>
      </div>

      <!-- 测试说明 -->
      <div class="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <h3 class="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">测试要点</h3>
        <ul class="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <li>• 观察渲染统计中的"跳过次数"：已完成的块应该被跳过</li>
          <li>• 流式输出过程中尝试选中文字：应该能够正常选中和复制</li>
          <li>• 观察代码块：应该只在完成时渲染一次语法高亮</li>
          <li>• 对比传统方案：每次更新不会闪烁整个内容</li>
        </ul>
      </div>

      <!-- 渲染结果 -->
      <div class="p-6 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
        <TestStreamMarkdown :content="content" :is-streaming="isStreaming" />
      </div>

      <!-- 原始内容对比 -->
      <details class="mt-6">
        <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          查看原始 Markdown 内容
        </summary>
        <pre class="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">{{ content }}</pre>
      </details>
    </div>
  </div>
</template>

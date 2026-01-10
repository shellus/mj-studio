<script setup lang="ts">
import type { MjDrawingParams } from '~/composables/useMarkdown'

const props = defineProps<{
  html: string
}>()

// Base64 解码
function decodeBase64(str: string): string {
  return decodeURIComponent(escape(atob(str)))
}

// 解析 HTML 内容，分离普通 HTML 和绘图组件
interface ContentPart {
  type: 'html' | 'drawing'
  content: string // HTML 内容或 base64 编码的绘图参数
}

const parts = computed<ContentPart[]>(() => {
  if (!props.html) return []

  const result: ContentPart[] = []
  const regex = /<div class="mj-drawing-block" data-mj-drawing="([^"]+)"><\/div>/g

  let lastIndex = 0
  let match

  while ((match = regex.exec(props.html)) !== null) {
    // 添加绘图块之前的 HTML
    if (match.index > lastIndex) {
      const htmlPart = props.html.slice(lastIndex, match.index)
      if (htmlPart.trim()) {
        result.push({ type: 'html', content: htmlPart })
      }
    }

    // 添加绘图块
    result.push({ type: 'drawing', content: match[1] || '' })

    lastIndex = match.index + match[0].length
  }

  // 添加最后的 HTML
  if (lastIndex < props.html.length) {
    const htmlPart = props.html.slice(lastIndex)
    if (htmlPart.trim()) {
      result.push({ type: 'html', content: htmlPart })
    }
  }

  // 如果没有绘图块，返回整个 HTML
  if (result.length === 0 && props.html.trim()) {
    result.push({ type: 'html', content: props.html })
  }

  return result
})

// 解析绘图参数
function parseDrawingParams(base64Data: string): MjDrawingParams {
  try {
    return JSON.parse(decodeBase64(base64Data))
  } catch {
    return { uniqueId: '', prompt: '' }
  }
}
</script>

<template>
  <div class="markdown-content-wrapper">
    <template v-for="(part, index) in parts" :key="index">
      <div v-if="part.type === 'html'" v-html="part.content" class="markdown-content" />
      <ChatMjDrawingBlock
        v-else
        :params="parseDrawingParams(part.content)"
      />
    </template>
  </div>
</template>

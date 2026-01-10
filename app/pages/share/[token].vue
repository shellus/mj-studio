<script setup lang="ts">
import { renderMarkdown } from '~/composables/useMarkdown'

definePageMeta({
  layout: false,
})

const route = useRoute()
const token = route.params.token as string
const config = useRuntimeConfig()

// 获取分享数据
const { data, error, status } = await useFetch(`/api/share/${token}`)

// 页面标题
const pageTitle = computed(() => {
  if (!data.value) return config.public.siteName
  const title = data.value.conversation.title
  const assistant = data.value.assistant?.name
  return assistant ? `${title} - ${assistant}` : title
})

// 页面描述
const pageDescription = computed(() => {
  if (!data.value) return `${config.public.siteName} 对话分享`
  const msgCount = data.value.messages.length
  const assistant = data.value.assistant?.name || 'AI'
  return `与 ${assistant} 的对话，共 ${msgCount} 条消息`
})

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  ogType: 'article',
  ogSiteName: config.public.siteName,
  twitterCard: 'summary',
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
})

// 渲染后的消息
const renderedMessages = ref<Map<number, string>>(new Map())

// 格式化时间
function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 替换绘图组件占位符为静态图片
function replaceDrawingBlocks(html: string): string {
  if (!data.value?.illustrations) return html

  // 匹配绘图组件占位符
  const regex = /<div class="mj-drawing-block" data-mj-drawing="([^"]+)"><\/div>/g

  return html.replace(regex, (_, base64Data) => {
    try {
      const params = JSON.parse(decodeURIComponent(escape(atob(base64Data))))
      const imageUrl = data.value?.illustrations?.[params.uniqueId]

      if (imageUrl) {
        return `<div class="share-illustration"><img src="${imageUrl}" alt="${params.prompt || ''}" /></div>`
      }
      return `<div class="share-illustration-placeholder">插图未生成</div>`
    } catch {
      return ''
    }
  })
}

// 渲染消息
async function renderMessages() {
  if (!data.value?.messages) return
  for (const msg of data.value.messages) {
    if (msg.content && !renderedMessages.value.has(msg.id)) {
      let html = await renderMarkdown(msg.content)
      html = replaceDrawingBlocks(html)
      renderedMessages.value.set(msg.id, html)
    }
  }
}

// 获取渲染内容
function getRenderedContent(msg: { id: number; content: string }): string {
  return renderedMessages.value.get(msg.id) || msg.content
}

// 打印
function handlePrint() {
  window.print()
}

// 数据加载后渲染消息
watch(data, () => {
  if (data.value) {
    renderMessages()
  }
}, { immediate: true })
</script>

<template>
  <div class="share-page">
    <!-- 错误状态 -->
    <div v-if="error" class="error-state">
      <div class="error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <h1>无法访问</h1>
      <p>{{ error.data?.message || '分享链接无效或已过期' }}</p>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="status === 'pending'" class="loading-state">
      <div class="loading-spinner" />
      <p>加载中...</p>
    </div>

    <!-- 内容 -->
    <template v-else-if="data">
      <!-- 工具栏（打印时隐藏） -->
      <div class="toolbar no-print">
        <div class="site-name">{{ config.public.siteName }}</div>
        <a href="#" class="export-link" @click.prevent="handlePrint">导出 PDF</a>
      </div>

      <!-- 主内容 -->
      <div class="content">
        <!-- 头部 -->
        <header class="header">
          <div class="site-title">{{ config.public.siteName }} 对话分享</div>
          <h1 class="title">{{ data.conversation.title }}</h1>
          <div class="meta">
            <span v-if="data.assistant" class="assistant-tag">{{ data.assistant.name }}</span>
            创建：{{ formatDateTime(data.conversation.createdAt) }} ·
            更新：{{ formatDateTime(data.conversation.updatedAt) }} ·
            {{ data.messages.length }} 条消息
          </div>
        </header>

        <!-- 消息列表 -->
        <div class="messages">
          <div
            v-for="msg in data.messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div class="message-header">
              <span class="role">{{ msg.role === 'user' ? '用户' : '助手' }}</span>
              <span class="time">{{ formatDateTime(msg.createdAt) }}</span>
            </div>
            <div class="bubble">
              <div class="markdown-content" v-html="getRenderedContent(msg)" />
            </div>
          </div>
        </div>

        <!-- 页脚 -->
        <footer class="footer">
          导出自 Mj-Studio · {{ formatDateTime(new Date().toISOString()) }}
        </footer>
      </div>
    </template>
  </div>
</template>

<style scoped>
.share-page {
  min-height: 100vh;
  background: #f9fafb;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 工具栏 */
.toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.site-name {
  font-weight: 600;
  color: #374151;
}

.export-link {
  color: #6b7280;
  font-size: 13px;
  text-decoration: none;
}

.export-link:hover {
  color: #2563eb;
  text-decoration: underline;
}

/* 主内容 */
.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
}

/* 头部 */
.header {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.site-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 16px 0;
}

.meta {
  font-size: 12px;
  color: #9ca3af;
}

.assistant-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e0e7ff;
  color: #4338ca;
  border-radius: 4px;
  font-weight: 500;
  margin-right: 8px;
}

/* 消息列表 */
.messages {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message.user {
  align-items: flex-end;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.message.user .message-header {
  flex-direction: row-reverse;
}

.message-header .role {
  font-weight: 600;
}

.message.user .message-header .role {
  color: #2563eb;
}

.message.assistant .message-header .role {
  color: #059669;
}

.message-header .time {
  color: #9ca3af;
}

.bubble {
  display: inline-block;
  max-width: 100%;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

@media (min-width: 768px) {
  .bubble {
    max-width: 85%;
  }
}

.message.user .bubble {
  background: #2563eb !important;
  color: white !important;
  border-top-right-radius: 4px;
}

.message.assistant .bubble {
  background: #f3f4f6;
  border-top-left-radius: 4px;
  color: #1f2937;
}

/* 页脚 */
.footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

/* 错误/加载状态 */
.error-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  text-align: center;
}

.error-icon svg {
  width: 64px;
  height: 64px;
  color: #ef4444;
  margin-bottom: 16px;
}

.error-state h1 {
  font-size: 20px;
  color: #111827;
  margin: 0 0 8px 0;
}

.error-state p {
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 打印样式 */
@media print {
  .no-print {
    display: none !important;
  }

  .share-page {
    background: white;
  }

  .content {
    max-width: none;
    padding: 0;
  }

  .bubble {
    box-shadow: none;
  }

  .message.assistant .bubble {
    background: #f3f4f6;
  }
}
</style>

<style>
/* Markdown 全局样式 */
.share-page .markdown-content p {
  margin: 0 0 8px 0;
}

.share-page .markdown-content p:last-child {
  margin-bottom: 0;
}

.share-page .markdown-content pre {
  background: #1f2937;
  color: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  margin: 8px 0;
}

.share-page .markdown-content code {
  font-family: "SF Mono", Monaco, monospace;
}

.share-page .markdown-content code:not(pre code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.share-page .message.user .markdown-content code:not(pre code) {
  background: rgba(255, 255, 255, 0.2);
}

.share-page .markdown-content ul,
.share-page .markdown-content ol {
  padding-left: 20px;
  margin: 8px 0;
}

.share-page .markdown-content blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 12px;
  color: #6b7280;
  font-style: italic;
  margin: 8px 0;
}

.share-page .markdown-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.share-page .markdown-content th,
.share-page .markdown-content td {
  border: 1px solid #e5e7eb;
  padding: 8px 12px;
  text-align: left;
}

.share-page .markdown-content th {
  background: #f3f4f6;
}

/* 插图样式 */
.share-page .share-illustration {
  margin: 12px 0;
  border-radius: 8px;
  overflow: hidden;
  max-width: 400px;
}

.share-page .share-illustration img {
  width: 100%;
  height: auto;
  display: block;
}

.share-page .share-illustration-placeholder {
  margin: 12px 0;
  padding: 24px;
  background: #f3f4f6;
  border-radius: 8px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>

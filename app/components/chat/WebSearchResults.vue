<script setup lang="ts">
/**
 * WebSearchResults - Web Search 结果展示组件
 *
 * 显示 AI 模型的联网搜索状态和结果
 * - 搜索中：显示加载动画
 * - 搜索完成：显示结果列表（favicon + 标题 + 时间）
 */

export interface WebSearchResult {
  url: string
  title: string
  pageAge?: string
}

const props = defineProps<{
  status: 'searching' | 'completed'
  results?: WebSearchResult[]
}>()

// 从 URL 提取域名用于显示
function getDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// 获取 favicon URL
function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`
  } catch {
    return ''
  }
}

// 格式化时间显示
function formatPageAge(pageAge?: string): string {
  if (!pageAge) return ''
  // pageAge 格式可能是 ISO 日期或相对时间描述
  // 简单处理：如果是日期格式，计算相对时间
  try {
    const date = new Date(pageAge)
    if (!isNaN(date.getTime())) {
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return '今天'
      if (diffDays === 1) return '昨天'
      if (diffDays < 7) return `${diffDays}天前`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`
      return `${Math.floor(diffDays / 365)}年前`
    }
  } catch {
    // 忽略解析错误
  }
  return pageAge
}

// 展开/收起状态
const isExpanded = ref(false)

// 默认显示的结果数量
const DEFAULT_VISIBLE_COUNT = 3

// 可见的结果
const visibleResults = computed(() => {
  if (!props.results) return []
  if (isExpanded.value) return props.results
  return props.results.slice(0, DEFAULT_VISIBLE_COUNT)
})

// 是否有更多结果
const hasMore = computed(() => {
  return props.results && props.results.length > DEFAULT_VISIBLE_COUNT
})
</script>

<template>
  <div class="web-search-block my-3 rounded-lg border border-(--ui-border) overflow-hidden bg-(--ui-bg-elevated)">
    <!-- 搜索中状态 -->
    <div v-if="status === 'searching'" class="px-4 py-2.5 flex items-center gap-2 text-(--ui-text-muted)">
      <UIcon name="i-heroicons-globe-alt" class="w-4 h-4" />
      <span class="text-sm">已发起网络搜索</span>
    </div>

    <!-- 搜索完成状态 -->
    <div v-else-if="status === 'completed' && results && results.length > 0">
      <!-- 标题栏 -->
      <div class="px-4 py-2.5 border-b border-(--ui-border) flex items-center gap-2">
        <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-(--ui-primary)" />
        <span class="text-sm font-medium text-(--ui-text)">搜索结果</span>
        <span class="text-xs text-(--ui-text-muted)">({{ results.length }} 条)</span>
      </div>

      <!-- 结果列表 -->
      <div class="divide-y divide-(--ui-border)">
        <a
          v-for="(result, index) in visibleResults"
          :key="index"
          :href="result.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-start gap-3 px-4 py-2.5 hover:bg-(--ui-bg-muted) transition-colors"
        >
          <!-- Favicon -->
          <img
            :src="getFaviconUrl(result.url)"
            :alt="getDomain(result.url)"
            class="w-4 h-4 mt-0.5 rounded-sm flex-shrink-0"
            loading="lazy"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <!-- 内容 -->
          <div class="flex-1 min-w-0">
            <p class="text-sm text-(--ui-text) line-clamp-1 hover:text-(--ui-primary)">
              {{ result.title }}
            </p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs text-(--ui-text-muted) truncate">{{ getDomain(result.url) }}</span>
              <span v-if="result.pageAge" class="text-xs text-(--ui-text-dimmed)">
                · {{ formatPageAge(result.pageAge) }}
              </span>
            </div>
          </div>
          <!-- 外链图标 -->
          <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 text-(--ui-text-muted) flex-shrink-0 mt-0.5" />
        </a>
      </div>

      <!-- 展开/收起按钮 -->
      <button
        v-if="hasMore"
        class="w-full px-4 py-2 text-xs text-(--ui-text-muted) hover:text-(--ui-text) hover:bg-(--ui-bg-muted) transition-colors flex items-center justify-center gap-1"
        @click="isExpanded = !isExpanded"
      >
        <span>{{ isExpanded ? '收起' : `查看全部 ${results.length} 条结果` }}</span>
        <UIcon
          :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          class="w-3.5 h-3.5"
        />
      </button>
    </div>

    <!-- 无结果状态 -->
    <div v-else-if="status === 'completed'" class="px-4 py-3 flex items-center gap-3">
      <UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-(--ui-text-muted)" />
      <span class="text-sm text-(--ui-text-muted)">未找到相关结果</span>
    </div>
  </div>
</template>

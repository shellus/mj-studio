<script setup lang="ts">
/**
 * StreamMarkdown - 流式 Markdown 分块渲染组件
 *
 * 核心思路：使用 marked.lexer() 将 Markdown 分词为 tokens，
 * 每个 token 作为独立块渲染，已完成的块不再更新。
 */
import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'
import { codeToHtml, type BundledLanguage } from 'shiki'

const props = defineProps<{
  content: string
  isStreaming?: boolean
}>()

// 语言映射
const LANGUAGE_MAP: Record<string, BundledLanguage> = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  vue: 'vue',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  python: 'python',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  dockerfile: 'dockerfile',
}

// 代码高亮缓存
const codeCache = new Map<string, string>()

// 创建 marked 实例（用于分词）
const marked = new Marked()

// 将 tokens 分词
const tokens = computed(() => {
  if (!props.content) return []
  return marked.lexer(props.content)
})

// 已完成块的渲染缓存（按块索引 + 内容哈希）
const blockCache = new Map<string, string>()

// 渲染单个 token 为 HTML
async function renderToken(token: Token): Promise<string> {
  switch (token.type) {
    case 'heading':
      const sizes: Record<number, string> = {
        1: 'text-xl font-bold',
        2: 'text-lg font-bold',
        3: 'text-base font-semibold',
        4: 'text-sm font-semibold',
        5: 'text-sm font-medium',
        6: 'text-xs font-medium',
      }
      return `<h${token.depth} class="${sizes[token.depth]} mb-2">${escapeHtml(token.text)}</h${token.depth}>`

    case 'paragraph':
      return `<p class="mb-2 last:mb-0">${escapeHtml(token.text)}</p>`

    case 'code':
      const lang = token.lang || 'text'
      const code = token.text
      const cacheKey = `${lang}:${code}`

      if (codeCache.has(cacheKey)) {
        return wrapCodeBlock(codeCache.get(cacheKey)!)
      }

      try {
        const language = LANGUAGE_MAP[lang.toLowerCase()] || 'text'
        const html = await codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        codeCache.set(cacheKey, html)
        return wrapCodeBlock(html)
      } catch {
        const html = await codeToHtml(code, {
          lang: 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        codeCache.set(cacheKey, html)
        return wrapCodeBlock(html)
      }

    case 'blockquote':
      const quoteContent = token.tokens ? await renderTokens(token.tokens) : escapeHtml(token.text)
      return `<blockquote class="border-l-4 border-(--ui-border-accented) pl-4 py-1 my-2 text-(--ui-text-muted) italic">${quoteContent}</blockquote>`

    case 'list':
      const tag = token.ordered ? 'ol' : 'ul'
      const listClass = token.ordered ? 'list-decimal' : 'list-disc'
      const items = await Promise.all(
        token.items.map(async (item: Tokens.ListItem) => {
          const content = item.tokens ? await renderTokens(item.tokens) : escapeHtml(item.text)
          return `<li>${content}</li>`
        })
      )
      return `<${tag} class="${listClass} pl-5 mb-2 space-y-1">${items.join('')}</${tag}>`

    case 'hr':
      return '<hr class="my-4 border-(--ui-border)" />'

    case 'table':
      const headerCells = token.header.map((cell: Tokens.TableCell) =>
        `<th class="px-3 py-2 text-left border border-(--ui-border) bg-(--ui-bg-elevated)">${escapeHtml(cell.text)}</th>`
      ).join('')
      const bodyRows = token.rows.map((row: Tokens.TableCell[]) => {
        const cells = row.map((cell: Tokens.TableCell) =>
          `<td class="px-3 py-2 border border-(--ui-border)">${escapeHtml(cell.text)}</td>`
        ).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      return `<div class="overflow-x-auto my-2"><table class="min-w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`

    case 'space':
      return ''

    default:
      // 其他类型直接返回原始文本
      if ('text' in token) {
        return `<p class="mb-2">${escapeHtml(token.text as string)}</p>`
      }
      return ''
  }
}

// 渲染多个 tokens
async function renderTokens(tokens: Token[]): Promise<string> {
  const results = await Promise.all(tokens.map(renderToken))
  return results.join('')
}

// 包装代码块
function wrapCodeBlock(html: string): string {
  return `<div class="my-2 rounded-lg overflow-hidden text-sm [&>pre]:p-4 [&>pre]:overflow-x-auto">${html}</div>`
}

// HTML 转义
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 每个块的渲染状态
interface BlockState {
  index: number
  token: Token
  html: string
  isComplete: boolean
}

// 块列表状态
const blocks = ref<BlockState[]>([])

// 渲染统计（用于调试）
const renderStats = ref({
  totalRenders: 0,
  skippedRenders: 0,
  lastRenderTime: 0,
})

// 监听 tokens 变化，增量更新块
watch(
  tokens,
  async (newTokens) => {
    const startTime = performance.now()
    renderStats.value.totalRenders++

    const newBlocks: BlockState[] = []

    for (let i = 0; i < newTokens.length; i++) {
      const token = newTokens[i]
      if (!token) continue

      const isLast = i === newTokens.length - 1
      const isComplete = !props.isStreaming || !isLast

      // 检查缓存：如果块已完成且内容未变，复用缓存
      const cacheKey = `${i}:${token.raw}`
      const existingBlock = blocks.value[i]

      if (existingBlock && existingBlock.isComplete && blockCache.has(cacheKey)) {
        // 已完成的块直接复用
        renderStats.value.skippedRenders++
        newBlocks.push({
          index: i,
          token,
          html: blockCache.get(cacheKey)!,
          isComplete: true,
        })
      } else {
        // 需要渲染的块
        const html = await renderToken(token)

        if (isComplete) {
          blockCache.set(cacheKey, html)
        }

        newBlocks.push({
          index: i,
          token,
          html,
          isComplete,
        })
      }
    }

    blocks.value = newBlocks
    renderStats.value.lastRenderTime = performance.now() - startTime
  },
  { immediate: true }
)
</script>

<template>
  <div class="stream-markdown">
    <!-- 渲染统计（调试用） -->
    <div class="text-xs text-gray-500 mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
      渲染次数: {{ renderStats.totalRenders }} |
      跳过次数: {{ renderStats.skippedRenders }} |
      耗时: {{ renderStats.lastRenderTime.toFixed(2) }}ms |
      块数: {{ blocks.length }}
    </div>

    <!-- 分块渲染 -->
    <div
      v-for="block in blocks"
      :key="`block-${block.index}`"
      class="markdown-block"
      :class="{ 'opacity-70': !block.isComplete && isStreaming }"
      v-html="block.html"
    />

    <!-- 流式光标 -->
    <span v-if="isStreaming" class="inline-block w-2 h-4 bg-current animate-pulse" />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.stream-markdown {
  @apply text-sm leading-relaxed;
}

.markdown-block {
  /* 块之间的过渡效果 */
  transition: opacity 0.15s ease;
}
</style>

<script setup lang="ts">
/**
 * StreamMarkdown - 流式 Markdown 分块渲染组件（正式版）
 *
 * 核心思路：使用 marked.lexer() 将 Markdown 分词为 tokens，
 * 每个 token 作为独立块渲染，已完成的块不再更新。
 *
 * 支持：
 * - 标准 Markdown 元素
 * - <think>/<thinking> 思考块折叠
 * - mj-drawing 绘图组件
 * - 代码高亮（shiki）
 */
import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'
import { codeToHtml, type BundledLanguage } from 'shiki'
import type { MjDrawingParams } from '~/composables/useMarkdown'
import type { WebSearchResult } from './WebSearchResults.vue'

// Web Search 解析结果
interface WebSearchParams {
  status: 'searching' | 'completed'
  results?: WebSearchResult[]
}

const props = defineProps<{
  content: string
  isStreaming?: boolean
  messageId?: number
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

// 代码高亮缓存（全局）
const codeCache = new Map<string, string>()

// 创建 marked 实例
const marked = new Marked()

// 预处理内容：处理 think 标签
function preprocessContent(content: string): string {
  if (!content) return ''

  let result = content

  // 清理零宽字符
  result = result.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')

  // 处理 :::details 折叠块语法 → 转为 details-block 代码块
  result = result.replace(
    /^:::\s*details\s+(.+)\n([\s\S]*?)^:::\s*$/gm,
    (_, summary, innerContent) => `\`\`\`details-block\n${summary.trim()}\n${innerContent.trim()}\n\`\`\`\n\n`
  )

  // 将已闭合的 <think>/<thinking> 转换为特殊代码块（便于分块处理）
  result = result.replace(
    /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>\s*/g,
    (_, thinkContent) => {
      const trimmed = thinkContent.trim()
      if (!trimmed) return ''
      return `\`\`\`think-block\n${trimmed}\n\`\`\`\n\n`
    }
  )

  // 处理未闭合的思考标签（流式输出中）
  result = result.replace(
    /<think(?:ing)?>\n?([\s\S]*)$/,
    (_, thinkContent) => {
      const trimmed = thinkContent.trim()
      if (!trimmed) return '*思考中...*\n\n'
      return `\`\`\`think-block-streaming\n${trimmed}\n\`\`\`\n\n`
    }
  )

  // 处理未闭合的 mj-drawing 代码块
  const hasUnclosedMjDrawing = (() => {
    const openPattern = /```mj-drawing\s*\n/g
    const completePattern = /```mj-drawing\s*\n[\s\S]*?\n```/g
    const openMatches = result.match(openPattern) || []
    const completeMatches = result.match(completePattern) || []
    return openMatches.length > completeMatches.length
  })()

  if (hasUnclosedMjDrawing) {
    const lastOpenIndex = result.lastIndexOf('```mj-drawing')
    if (lastOpenIndex !== -1) {
      result = result.slice(0, lastOpenIndex) + '\n\n*正在生成插图参数...*\n\n'
    }
  }

  return result
}

// 将 Markdown 分词
const tokens = computed(() => {
  const preprocessed = preprocessContent(props.content)
  if (!preprocessed) return []
  return marked.lexer(preprocessed)
})

// 已完成块的渲染缓存
const blockCache = new Map<string, string>()

// 解析 mj-drawing 参数
function parseMjDrawingParams(text: string): MjDrawingParams {
  const params: MjDrawingParams = {
    uniqueId: '',
    prompt: '',
    autostart: false,
  }

  const lines = text.trim().split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim().toLowerCase()
    const value = line.slice(colonIndex + 1).trim()

    switch (key) {
      case 'uniqueid':
        params.uniqueId = value
        break
      case 'prompt':
        params.prompt = value
        break
      case 'model':
        params.model = value
        break
      case 'negative':
        params.negative = value
        break
      case 'autostart':
        params.autostart = value.toLowerCase() === 'true'
        break
    }
  }

  return params
}

// 解析 web-search 参数
function parseWebSearchParams(text: string): WebSearchParams {
  const params: WebSearchParams = {
    status: 'searching',
  }

  const lines = text.trim().split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim().toLowerCase()
    const value = line.slice(colonIndex + 1).trim()

    if (key === 'status') {
      if (value === 'searching' || value === 'completed') {
        params.status = value
      }
    } else if (key === 'results') {
      try {
        params.results = JSON.parse(value)
      } catch {
        // 忽略解析错误
      }
    }
  }

  return params
}

// 渲染行内元素（加粗、斜体、链接等）
function renderInline(text: string): string {
  let result = escapeHtml(text)

  // 加粗 **text** 或 __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  result = result.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>')

  // 斜体 *text* 或 _text_（需要排除已处理的加粗）
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>')
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em class="italic">$1</em>')

  // 删除线 ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<del class="line-through text-(--ui-text-muted)">$1</del>')

  // 行内代码 `code`
  result = result.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-(--ui-bg-elevated) text-sm font-mono">$1</code>')

  // 图片 ![alt](url) - 必须在链接之前处理
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg my-2 inline-block" loading="lazy" />'
  )

  // 链接 [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-(--ui-primary) hover:underline">$1</a>'
  )

  return result
}

// 渲染单个 token 为 HTML
async function renderToken(token: Token): Promise<{ type: 'html' | 'drawing' | 'think' | 'think-streaming' | 'web-search' | 'details', content: string }> {
  switch (token.type) {
    case 'heading': {
      const sizes: Record<number, string> = {
        1: 'text-xl font-bold',
        2: 'text-lg font-bold',
        3: 'text-base font-semibold',
        4: 'text-sm font-semibold',
        5: 'text-sm font-medium',
        6: 'text-xs font-medium',
      }
      return { type: 'html', content: `<h${token.depth} class="${sizes[token.depth]} mb-2">${renderInline(token.text)}</h${token.depth}>` }
    }

    case 'paragraph':
      return { type: 'html', content: `<p class="mb-2 last:mb-0">${renderInline(token.text)}</p>` }

    case 'code': {
      const lang = token.lang || 'text'
      const code = token.text

      // 思考块处理
      if (lang === 'think-block') {
        return { type: 'think', content: code }
      }

      // 流式思考块
      if (lang === 'think-block-streaming') {
        return { type: 'think-streaming', content: code }
      }

      // mj-drawing 绘图组件
      if (lang === 'mj-drawing') {
        return { type: 'drawing', content: code }
      }

      // web-search 搜索结果组件
      if (lang === 'web-search') {
        return { type: 'web-search', content: code }
      }

      // details 折叠块
      if (lang === 'details-block') {
        return { type: 'details', content: code }
      }

      // 普通代码块
      const cacheKey = `${lang}:${code}`
      if (codeCache.has(cacheKey)) {
        return { type: 'html', content: wrapCodeBlock(codeCache.get(cacheKey)!) }
      }

      try {
        const language = LANGUAGE_MAP[lang.toLowerCase()] || 'text'
        const html = await codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        codeCache.set(cacheKey, html)
        return { type: 'html', content: wrapCodeBlock(html) }
      } catch {
        const html = await codeToHtml(code, {
          lang: 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        codeCache.set(cacheKey, html)
        return { type: 'html', content: wrapCodeBlock(html) }
      }
    }

    case 'blockquote': {
      const quoteContent = token.tokens ? await renderTokensToHtml(token.tokens) : renderInline(token.text || '')
      return { type: 'html', content: `<blockquote class="border-l-4 border-(--ui-border-accented) pl-4 py-1 my-2 text-(--ui-text-muted) italic">${quoteContent}</blockquote>` }
    }

    case 'list': {
      const tag = token.ordered ? 'ol' : 'ul'
      const listClass = token.ordered ? 'list-decimal' : 'list-disc'
      const items = await Promise.all(
        token.items.map(async (item: Tokens.ListItem) => {
          const content = item.tokens ? await renderTokensToHtml(item.tokens) : renderInline(item.text)
          return `<li>${content}</li>`
        })
      )
      return { type: 'html', content: `<${tag} class="${listClass} pl-5 mb-2 space-y-1">${items.join('')}</${tag}>` }
    }

    case 'hr':
      return { type: 'html', content: '<hr class="my-4 border-(--ui-border)" />' }

    case 'table': {
      const headerCells = token.header.map((cell: Tokens.TableCell) =>
        `<th class="px-3 py-2 text-left border border-(--ui-border) bg-(--ui-bg-elevated)">${renderInline(cell.text)}</th>`
      ).join('')
      const bodyRows = token.rows.map((row: Tokens.TableCell[]) => {
        const cells = row.map((cell: Tokens.TableCell) =>
          `<td class="px-3 py-2 border border-(--ui-border)">${renderInline(cell.text)}</td>`
        ).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      return { type: 'html', content: `<div class="overflow-x-auto my-2"><table class="min-w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>` }
    }

    case 'space':
      return { type: 'html', content: '' }

    default:
      if ('text' in token && token.text) {
        return { type: 'html', content: `<p class="mb-2">${renderInline(token.text as string)}</p>` }
      }
      return { type: 'html', content: '' }
  }
}

// 渲染多个 tokens 为纯 HTML
async function renderTokensToHtml(tokens: Token[]): Promise<string> {
  const results = await Promise.all(tokens.map(async t => {
    const result = await renderToken(t)
    return result.type === 'html' ? result.content : ''
  }))
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
  type: 'html' | 'drawing' | 'think' | 'think-streaming' | 'web-search' | 'details'
  content: string
  drawingParams?: MjDrawingParams
  webSearchParams?: WebSearchParams
  isComplete: boolean
}

// 块列表状态
const blocks = ref<BlockState[]>([])

// 监听 tokens 变化，增量更新块
watch(
  tokens,
  async (newTokens) => {
    const newBlocks: BlockState[] = []

    for (let i = 0; i < newTokens.length; i++) {
      const token = newTokens[i]
      if (!token) continue

      const isLast = i === newTokens.length - 1
      const isComplete = !props.isStreaming || !isLast

      // 检查缓存
      const cacheKey = `${i}:${token.raw}`
      const existingBlock = blocks.value[i]

      if (existingBlock && existingBlock.isComplete && blockCache.has(cacheKey)) {
        // 已完成块复用缓存
        const cached = JSON.parse(blockCache.get(cacheKey)!) as BlockState
        newBlocks.push(cached)
      } else {
        // 渲染新块
        const result = await renderToken(token)

        const block: BlockState = {
          index: i,
          type: result.type,
          content: result.content,
          isComplete,
        }

        // 解析绘图参数
        if (result.type === 'drawing') {
          block.drawingParams = parseMjDrawingParams(result.content)
        }

        // 解析 web-search 参数
        if (result.type === 'web-search') {
          block.webSearchParams = parseWebSearchParams(result.content)
        }

        if (isComplete) {
          blockCache.set(cacheKey, JSON.stringify(block))
        }

        newBlocks.push(block)
      }
    }

    blocks.value = newBlocks
  },
  { immediate: true }
)

// 思考块展开状态
const thinkExpanded = ref<Set<number>>(new Set())

function toggleThink(index: number) {
  if (thinkExpanded.value.has(index)) {
    thinkExpanded.value.delete(index)
  } else {
    thinkExpanded.value.add(index)
  }
}
</script>

<template>
  <div class="stream-markdown">
    <template v-for="block in blocks" :key="`block-${block.index}`">
      <!-- 普通 HTML 块 -->
      <div
        v-if="block.type === 'html' && block.content"
        class="markdown-block"
        v-html="block.content"
      />

      <!-- 绘图组件块 -->
      <ChatMjDrawingBlock
        v-else-if="block.type === 'drawing' && block.drawingParams"
        :params="block.drawingParams"
      />

      <!-- 思考块（已完成） -->
      <details
        v-else-if="block.type === 'think'"
        class="think-block my-2"
        :open="thinkExpanded.has(block.index)"
      >
        <summary
          class="cursor-pointer text-sm text-(--ui-text-muted) hover:text-(--ui-text) select-none"
          @click.prevent="toggleThink(block.index)"
        >
          <span class="inline-flex items-center gap-1">
            <UIcon
              :name="thinkExpanded.has(block.index) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-4 h-4"
            />
            思考过程
          </span>
        </summary>
        <div class="mt-2 pl-5 text-sm text-(--ui-text-muted) whitespace-pre-wrap">{{ block.content }}</div>
      </details>

      <!-- 思考块（流式输出中） -->
      <div v-else-if="block.type === 'think-streaming'" class="think-block-streaming my-2">
        <div class="text-sm text-(--ui-text-muted) flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
          思考中...
        </div>
        <div class="mt-2 pl-5 text-sm text-(--ui-text-muted) whitespace-pre-wrap">{{ block.content }}</div>
      </div>

      <!-- Web Search 搜索结果块 -->
      <ChatWebSearchResults
        v-else-if="block.type === 'web-search' && block.webSearchParams"
        :status="block.webSearchParams.status"
        :results="block.webSearchParams.results"
      />

      <!-- Details 折叠块 -->
      <details v-else-if="block.type === 'details'" class="think-block my-2">
        <summary class="cursor-pointer text-sm text-(--ui-text-muted) hover:text-(--ui-text) select-none">
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
            {{ block.content.split('\n')[0] }}
          </span>
        </summary>
        <div class="mt-2 pl-5 text-sm text-(--ui-text-muted) whitespace-pre-wrap">{{ block.content.split('\n').slice(1).join('\n') }}</div>
      </details>
    </template>

    <!-- 流式光标 -->
    <span v-if="isStreaming" class="inline-block w-2 h-4 bg-current animate-pulse align-middle" />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.stream-markdown {
  @apply text-sm leading-relaxed;
}

.markdown-block {
  transition: opacity 0.15s ease;
}

.think-block summary::-webkit-details-marker {
  display: none;
}

.think-block summary::marker {
  display: none;
  content: none;
}

.think-block summary {
  list-style: none;
}
</style>

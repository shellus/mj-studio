// Markdown 渲染 composable
import { Marked } from 'marked'
import { codeToHtml, type BundledLanguage } from 'shiki'

// Base64 编解码（浏览器兼容）
function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

function decodeBase64(str: string): string {
  return decodeURIComponent(escape(atob(str)))
}

// 支持的语言映射（常见语言到 shiki 语言标识）
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
  rb: 'ruby',
  ruby: 'ruby',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
}

// 代码块缓存（避免重复渲染）
const codeCache = new Map<string, string>()

// 高亮代码块
async function highlightCode(code: string, lang: string): Promise<string> {
  const cacheKey = `${lang}:${code}`
  if (codeCache.has(cacheKey)) {
    return codeCache.get(cacheKey)!
  }

  const language = LANGUAGE_MAP[lang.toLowerCase()] || 'text'

  try {
    const html = await codeToHtml(code, {
      lang: language,
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    })
    codeCache.set(cacheKey, html)
    return html
  } catch {
    // 如果语言不支持，使用 text
    const html = await codeToHtml(code, {
      lang: 'text',
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    })
    codeCache.set(cacheKey, html)
    return html
  }
}

// 创建 Marked 实例
function createMarkedInstance() {
  const marked = new Marked()

  // 自定义渲染器
  marked.use({
    renderer: {
      // 代码块 - 返回占位符，稍后替换为高亮代码
      code({ text, lang }) {
        const language = lang || 'text'
        // 使用特殊标记，稍后异步替换
        const placeholder = `<!--CODE_BLOCK:${language}:${encodeBase64(text)}-->`
        return placeholder
      },
      // 行内代码
      codespan({ text }) {
        return `<code class="px-1.5 py-0.5 rounded bg-(--ui-bg-elevated) text-sm font-mono">${text}</code>`
      },
      // 链接
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" class="text-(--ui-primary) hover:underline">${text}</a>`
      },
      // 段落
      paragraph({ text }) {
        return `<p class="mb-2 last:mb-0">${text}</p>`
      },
      // 列表
      list({ items, ordered }) {
        const tag = ordered ? 'ol' : 'ul'
        const listClass = ordered ? 'list-decimal' : 'list-disc'
        const body = items.map(item => `<li>${item.text}</li>`).join('')
        return `<${tag} class="${listClass} pl-5 mb-2 space-y-1">${body}</${tag}>`
      },
      // 引用块
      blockquote({ text }) {
        return `<blockquote class="border-l-4 border-(--ui-border-accented) pl-4 py-1 my-2 text-(--ui-text-muted) italic">${text}</blockquote>`
      },
      // 标题
      heading({ text, depth }) {
        const sizes: Record<number, string> = {
          1: 'text-xl font-bold',
          2: 'text-lg font-bold',
          3: 'text-base font-semibold',
          4: 'text-sm font-semibold',
          5: 'text-sm font-medium',
          6: 'text-xs font-medium',
        }
        return `<h${depth} class="${sizes[depth]} mb-2">${text}</h${depth}>`
      },
      // 分隔线
      hr() {
        return '<hr class="my-4 border-(--ui-border)" />'
      },
      // 表格
      table({ header, rows }) {
        const headerCells = header.map(cell => `<th class="px-3 py-2 text-left border border-(--ui-border) bg-(--ui-bg-elevated)">${cell.text}</th>`).join('')
        const bodyRows = rows.map(row => {
          const cells = row.map(cell => `<td class="px-3 py-2 border border-(--ui-border)">${cell.text}</td>`).join('')
          return `<tr>${cells}</tr>`
        }).join('')
        return `<div class="overflow-x-auto my-2"><table class="min-w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
      },
      // 加粗
      strong({ text }) {
        return `<strong class="font-semibold">${text}</strong>`
      },
      // 斜体
      em({ text }) {
        return `<em class="italic">${text}</em>`
      },
      // 删除线
      del({ text }) {
        return `<del class="line-through text-(--ui-text-muted)">${text}</del>`
      },
    },
  })

  return marked
}

const marked = createMarkedInstance()

// 解析代码块占位符并替换为高亮代码
async function replaceCodeBlocks(html: string): Promise<string> {
  const codeBlockRegex = /<!--CODE_BLOCK:([^:]+):([^-]+)-->/g
  const matches = [...html.matchAll(codeBlockRegex)]

  if (matches.length === 0) return html

  // 并行处理所有代码块
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const [fullMatch, lang, base64Code] = match
      const code = decodeBase64(base64Code)
      const highlighted = await highlightCode(code, lang)
      // 包装代码块
      return {
        original: fullMatch,
        replacement: `<div class="my-2 rounded-lg overflow-hidden text-sm [&>pre]:p-4 [&>pre]:overflow-x-auto">${highlighted}</div>`,
      }
    })
  )

  // 替换所有代码块
  let result = html
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement)
  }

  return result
}

// 渲染 Markdown
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) return ''

  // 先用 marked 解析
  const html = await marked.parse(content)

  // 替换代码块占位符
  return replaceCodeBlocks(html)
}

// Vue composable
export function useMarkdown() {
  const renderedCache = new Map<string, string>()

  async function render(content: string): Promise<string> {
    if (renderedCache.has(content)) {
      return renderedCache.get(content)!
    }

    const html = await renderMarkdown(content)
    renderedCache.set(content, html)
    return html
  }

  return {
    render,
  }
}

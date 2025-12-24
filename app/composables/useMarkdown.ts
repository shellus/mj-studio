// Markdown 渲染 composable
import { Marked } from 'marked'
import { codeToHtml, type BundledLanguage } from 'shiki'

// 绘图组件参数类型
export interface MjDrawingParams {
  uniqueId: string
  prompt: string
  model?: string
  negative?: string
  autostart?: boolean
}

// 解析 mj-drawing 代码块参数
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
      // 代码块 - 返回占位符，稍后替换为高亮代码或绘图组件
      code({ text, lang }) {
        const language = lang || 'text'

        // 特殊处理 mj-drawing 代码块
        if (language === 'mj-drawing') {
          const params = parseMjDrawingParams(text)
          // 生成绘图组件占位符（包含 JSON 数据）
          return `<!--MJ_DRAWING:${encodeBase64(JSON.stringify(params))}-->`
        }

        // 普通代码块使用特殊标记，稍后异步替换
        const placeholder = `<!--CODE_BLOCK:${language}:${encodeBase64(text)}-->`
        return placeholder
      },
      // 行内代码
      codespan({ text }) {
        return `<code class="px-1.5 py-0.5 rounded bg-(--ui-bg-elevated) text-sm font-mono">${text}</code>`
      },
      // 链接
      link({ href, title, tokens }) {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" class="text-(--ui-primary) hover:underline">${this.parser.parseInline(tokens)}</a>`
      },
      // 段落
      paragraph({ tokens }) {
        return `<p class="mb-2 last:mb-0">${this.parser.parseInline(tokens)}</p>`
      },
      // 列表
      list({ items, ordered }) {
        const tag = ordered ? 'ol' : 'ul'
        const listClass = ordered ? 'list-decimal' : 'list-disc'
        const body = items.map(item => {
          const content = item.tokens ? this.parser.parse(item.tokens) : item.text
          return `<li>${content}</li>`
        }).join('')
        return `<${tag} class="${listClass} pl-5 mb-2 space-y-1">${body}</${tag}>`
      },
      // 引用块
      blockquote({ tokens }) {
        return `<blockquote class="border-l-4 border-(--ui-border-accented) pl-4 py-1 my-2 text-(--ui-text-muted) italic">${this.parser.parse(tokens)}</blockquote>`
      },
      // 标题
      heading({ tokens, depth }) {
        const sizes: Record<number, string> = {
          1: 'text-xl font-bold',
          2: 'text-lg font-bold',
          3: 'text-base font-semibold',
          4: 'text-sm font-semibold',
          5: 'text-sm font-medium',
          6: 'text-xs font-medium',
        }
        return `<h${depth} class="${sizes[depth]} mb-2">${this.parser.parseInline(tokens)}</h${depth}>`
      },
      // 分隔线
      hr() {
        return '<hr class="my-4 border-(--ui-border)" />'
      },
      // 表格
      table({ header, rows }) {
        const headerCells = header.map(cell => {
          const content = cell.tokens ? this.parser.parseInline(cell.tokens) : cell.text
          return `<th class="px-3 py-2 text-left border border-(--ui-border) bg-(--ui-bg-elevated)">${content}</th>`
        }).join('')
        const bodyRows = rows.map(row => {
          const cells = row.map(cell => {
            const content = cell.tokens ? this.parser.parseInline(cell.tokens) : cell.text
            return `<td class="px-3 py-2 border border-(--ui-border)">${content}</td>`
          }).join('')
          return `<tr>${cells}</tr>`
        }).join('')
        return `<div class="overflow-x-auto my-2"><table class="min-w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
      },
      // 加粗
      strong({ tokens }) {
        return `<strong class="font-semibold">${this.parser.parseInline(tokens)}</strong>`
      },
      // 斜体
      em({ tokens }) {
        return `<em class="italic">${this.parser.parseInline(tokens)}</em>`
      },
      // 删除线
      del({ tokens }) {
        return `<del class="line-through text-(--ui-text-muted)">${this.parser.parseInline(tokens)}</del>`
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
      const code = decodeBase64(base64Code!)
      const highlighted = await highlightCode(code, lang!)
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

// 替换绘图组件占位符为 HTML 元素（供 Vue 组件识别）
function replaceMjDrawingBlocks(html: string): string {
  const mjDrawingRegex = /<!--MJ_DRAWING:([^-]+)-->/g

  return html.replace(mjDrawingRegex, (_, base64Data) => {
    // 生成带有 data 属性的 div，供 Vue 组件识别和替换
    return `<div class="mj-drawing-block" data-mj-drawing="${base64Data}"></div>`
  })
}

// 检测未闭合的 mj-drawing 代码块（流式输出时可能出现）
function hasUnclosedMjDrawingBlock(content: string): boolean {
  // 匹配 ```mj-drawing 开始标记
  const openPattern = /```mj-drawing\s*\n/g
  // 匹配完整的 mj-drawing 代码块
  const completePattern = /```mj-drawing\s*\n[\s\S]*?\n```/g

  const openMatches = content.match(openPattern) || []
  const completeMatches = content.match(completePattern) || []

  return openMatches.length > completeMatches.length
}

// 将未闭合的 mj-drawing 代码块替换为加载占位符
function handleUnclosedMjDrawingBlock(content: string): string {
  // 如果没有未闭合的代码块，直接返回
  if (!hasUnclosedMjDrawingBlock(content)) {
    return content
  }

  // 找到最后一个未闭合的 ```mj-drawing 并替换为占位符
  const lastOpenIndex = content.lastIndexOf('```mj-drawing')
  if (lastOpenIndex === -1) return content

  // 截取到未闭合代码块之前的内容
  const beforeBlock = content.slice(0, lastOpenIndex)
  // 未闭合的代码块内容
  const unclosedBlock = content.slice(lastOpenIndex)

  // 返回前面的内容 + 加载中占位符
  return beforeBlock + '\n\n*正在生成插图参数...*\n\n'
}

// 渲染 Markdown
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) return ''

  // 清理零宽字符（U+200B 等），避免影响代码块解析
  let cleanContent = content.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')

  // 处理未闭合的 mj-drawing 代码块（流式输出时）
  cleanContent = handleUnclosedMjDrawingBlock(cleanContent)

  // 先用 marked 解析
  const html = await marked.parse(cleanContent)

  // 替换代码块占位符
  const withCodeBlocks = await replaceCodeBlocks(html)

  // 替换绘图组件占位符
  return replaceMjDrawingBlocks(withCodeBlocks)
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

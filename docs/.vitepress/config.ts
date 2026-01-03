import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
  title: 'MJ-Studio 文档',
  description: '多模型 AI 工作台文档中心',
  base: '/docs/',
  lang: 'zh-CN',

  // 输出到 public/docs 目录，Nuxt 会自动包含 public 目录到构建产物
  outDir: '../public/docs',

  // 忽略死链接
  ignoreDeadLinks: true,

  vite: {
    optimizeDeps: {
      include: ['mermaid', 'dayjs'],
    },
    ssr: {
      noExternal: ['mermaid'],
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/logo.png' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'MJ-Studio',

    nav: [
      { text: '首页', link: '/' },
      { text: '常见问题', link: '/docs/常见问题' },
      { text: '返回应用', link: 'javascript:window.location.href="/"' },
    ],

    sidebar: [
      {
        text: '帮助中心',
        items: [
          { text: '常见问题', link: '/docs/常见问题' },
        ],
      },
      {
        text: '功能模块',
        items: [
          { text: '对话功能', link: '/features/对话功能需求文档' },
          { text: '嵌入式绘图', link: '/features/嵌入式绘图组件设计' },
          { text: '流式输出', link: '/features/流式输出系统设计和实现规范' },
        ],
      },
      {
        text: '视频模块',
        items: [
          { text: '视频模型开发指南', link: '/video/视频模型开发指南' },
          { text: '视频模型调研', link: '/video/视频模型集成需求调研' },
        ],
      },
      {
        text: '工作流',
        items: [
          { text: '画布工作流设计', link: '/workflow/画布工作流设计' },
          { text: '节点类型系统', link: '/workflow/工作流节点类型系统' },
          { text: '执行系统', link: '/workflow/工作流执行系统' },
          { text: 'ComfyUI 集成', link: '/workflow/ComfyUI集成指南' },
        ],
      },
      {
        text: '设计规范',
        items: [
          { text: '设计系统', link: '/design/设计系统规范' },
          { text: '任务卡片组件', link: '/design/任务卡片组件设计文档' },
          { text: '模型选择器', link: '/design/模型选择器组件设计文档' },
          { text: '日志规范', link: '/design/日志规范需求' },
          { text: '错误规范', link: '/design/绘图任务错误规范' },
        ],
      },
      {
        text: '架构文档',
        items: [
          { text: '模型参数架构 RFC', link: '/architecture/RFC-模型参数架构重构' },
          { text: 'ImageForm 参数方案', link: '/architecture/ImageForm模型参数开发方案' },
          { text: '任务多图支持', link: '/architecture/任务多图支持设计' },
          { text: '对话压缩逻辑', link: '/architecture/对话压缩逻辑' },
          { text: '全局事件订阅', link: '/architecture/全局事件订阅系统设计' },
        ],
      },
      {
        text: '记忆系统',
        items: [
          { text: '记忆系统功能设计', link: '/memory/记忆系统功能设计' },
          { text: '为什么不实现自动化记忆', link: '/memory/为什么不实现自动化记忆系统' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-org/mj-studio' },
    ],

    footer: {
      message: 'MJ-Studio - 多模型 AI 工作台',
    },

    search: {
      provider: 'local',
    },

    outline: {
      label: '页面导航',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
  },

  mermaid: {
    class: 'mermaid',
  },
  mermaidPlugin: {},
})
)

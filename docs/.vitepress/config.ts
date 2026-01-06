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
      { text: '文档中心', link: '/index' },
      { text: '返回应用', link: 'javascript:window.location.href="/"' },
    ],

    sidebar: [
      {
        text: '概述',
        items: [
          { text: '项目介绍', link: '/index' },
        ],
      },
      {
        text: '功能介绍',
        items: [
          { text: '上游和模型配置', link: '/features/上游和模型配置' },
          { text: '对话功能', link: '/features/对话功能介绍' },
          { text: '对话压缩', link: '/features/对话压缩功能介绍' },
          { text: '流式输出', link: '/features/流式输出功能介绍' },
          { text: '生图功能', link: '/features/生图功能介绍' },
          { text: '视频生成', link: '/features/视频生成功能介绍' },
          { text: '嵌入式绘图组件', link: '/features/嵌入式绘图组件介绍' },
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
        text: '开发规范',
        items: [
          { text: '设计系统', link: '/dev-spec/设计系统' },
          { text: '任务卡片组件', link: '/dev-spec/任务卡片组件设计文档' },
          { text: '模型选择器', link: '/dev-spec/模型选择器组件设计文档' },
          { text: '日志系统说明', link: '/dev-spec/日志系统说明' },
          { text: '错误处理', link: '/dev-spec/错误处理' },
          { text: '全局事件订阅', link: '/dev-spec/全局事件订阅系统设计' },
        ],
      },
      {
        text: '功能规划',
        items: [
          { text: 'AI 群聊功能设计', link: '/planning/AI群聊功能设计' },
          { text: '记忆系统功能设计', link: '/planning/记忆系统功能设计' },
          { text: '为什么不实现自动化记忆', link: '/planning/为什么不实现自动化记忆系统' },
          { text: '任务多图支持设计', link: '/planning/任务多图支持设计' },
          { text: '对话分享系统设计', link: '/planning/对话分享系统设计' },
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

// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync, existsSync } from 'fs'

// 手动加载 .env 以支持 vite 配置中的环境变量
if (existsSync('.env')) {
  readFileSync('.env', 'utf-8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=')
    if (key && !key.startsWith('#') && !process.env[key]) {
      process.env[key] = vals.join('=')
    }
  })
}

const hmrPort = Number(process.env.NUXT_HMR_PORT) || 24678
console.log('[nuxt.config] HMR Port:', hmrPort)

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  future: { compatibilityVersion: 4 },

  modules: ['@nuxt/ui'],
  css: [
    '~/assets/css/main.css',
    '@vue-flow/core/dist/style.css',
    '@vue-flow/core/dist/theme-default.css',
    '@vue-flow/minimap/dist/style.css',
    '@vue-flow/controls/dist/style.css',
    '@vue-flow/node-resizer/dist/style.css',
  ],

  app: {
    head: {
      title: 'MJ Studio - 多模型 AI 工作台',
      meta: [
        { name: 'description', content: '轻量级多模型 AI 工作台，绘图与对话一站式体验' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },

  // 默认使用 dark 模式
  colorMode: {
    preference: 'dark',
  },

  // 使用本地图标包，避免运行时网络请求
  icon: {
    serverBundle: 'local',
  },
  // 禁用 Google Fonts 避免网络问题
  fonts: {
    provider: 'none',
  },

  runtimeConfig: {
    // JWT 密钥从环境变量读取
  },

  // Vite 配置：HMR 端口和远程访问
  vite: {
    server: {
      hmr: {
        port: hmrPort,
        host: '0.0.0.0',
      },
    },
  },
})

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

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  future: { compatibilityVersion: 4 },

  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'MJ Studio - 多模型 AI 绘图工作台',
      meta: [
        { name: 'description', content: '多模型 AI 绘图工作台' },
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
    session: {
      cookie: {
        secure: false, // 允许HTTP，生产环境通过反向代理处理HTTPS
      },
    },
  },

  // 多实例开发时通过 NUXT_HMR_PORT 环境变量避免 HMR 端口冲突
  vite: {
    server: {
      hmr: {
        port: Number(process.env.NUXT_HMR_PORT) || 24678,
      },
    },
  },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  future: { compatibilityVersion: 4 },

  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],

  // 禁用 Google Fonts 避免网络问题
  icon: {
    provider: 'iconify',
  },
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
})

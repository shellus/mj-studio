<script setup lang="ts">
// 首页无需登录
const { loggedIn } = useAuth()
</script>

<template>
  <div class="flex-1 flex flex-col">
    <!-- Hero Section -->
    <section class="flex-1 flex items-center justify-center px-6 py-20">
      <div class="max-w-4xl mx-auto text-center">
        <!-- Logo -->
        <div class="mb-8">
          <UIcon name="i-heroicons-sparkles" class="w-16 h-16 text-(--ui-primary) mx-auto mb-4" />
          <h1 class="text-5xl font-bold mb-4">
            <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MJ Studio
            </span>
          </h1>
          <p class="text-xl text-(--ui-text-muted)">多模型 AI 绘图工作台</p>
        </div>

        <!-- 特性介绍 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div class="p-6 rounded-2xl bg-(--ui-bg-elevated) border border-(--ui-border)">
            <UIcon name="i-heroicons-paint-brush" class="w-10 h-10 text-purple-500 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-(--ui-text) mb-2">AI 绘图</h3>
            <p class="text-sm text-(--ui-text-muted)">
              支持 Midjourney、DALL-E、Flux、Gemini 等多种 AI 绘图模型
            </p>
          </div>
          <div class="p-6 rounded-2xl bg-(--ui-bg-elevated) border border-(--ui-border)">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-10 h-10 text-blue-500 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-(--ui-text) mb-2">AI 对话</h3>
            <p class="text-sm text-(--ui-text-muted)">
              创建专属 AI 助手，支持自定义系统提示词和对话管理
            </p>
          </div>
          <div class="p-6 rounded-2xl bg-(--ui-bg-elevated) border border-(--ui-border)">
            <UIcon name="i-heroicons-server" class="w-10 h-10 text-green-500 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-(--ui-text) mb-2">多上游支持</h3>
            <p class="text-sm text-(--ui-text-muted)">
              灵活配置多个 API 上游，轻松切换不同服务提供商
            </p>
          </div>
        </div>

        <!-- CTA -->
        <div class="flex justify-center gap-4">
          <NuxtLink v-if="loggedIn" to="/drawing">
            <UButton size="lg" class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <UIcon name="i-heroicons-paint-brush" class="w-5 h-5 mr-2" />
              开始绘图
            </UButton>
          </NuxtLink>
          <NuxtLink v-else to="/login">
            <UButton size="lg" class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <UIcon name="i-heroicons-arrow-right-end-on-rectangle" class="w-5 h-5 mr-2" />
              登录开始
            </UButton>
          </NuxtLink>
          <NuxtLink v-if="loggedIn" to="/chat">
            <UButton size="lg" variant="outline">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 mr-2" />
              AI 对话
            </UButton>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-6 border-t border-(--ui-border)">
      <div class="max-w-7xl mx-auto px-6 text-center text-sm text-(--ui-text-dimmed)">
        MJ Studio - 多模型 AI 创作平台
      </div>
    </footer>
  </div>
</template>

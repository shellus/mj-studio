<script setup lang="ts">
import type { Aimodel } from '../../../composables/useUpstreams'

const { upstreams, isLoading, moveToTop, queryBalance } = useUpstreams()
const toast = useToast()
const router = useRouter()

// 余额查询中的配置 ID
const queryingBalanceIds = ref<Set<number>>(new Set())
// 移动到顶部中的配置 ID
const movingToTopIds = ref<Set<number>>(new Set())

// 移动到顶部
async function handleMoveToTop(id: number) {
  movingToTopIds.value.add(id)
  try {
    await moveToTop(id)
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    movingToTopIds.value.delete(id)
  }
}

// 统计绘图/对话模型数量
function getModelCounts(aimodels: Aimodel[]) {
  if (!aimodels) return { image: 0, chat: 0 }
  const image = aimodels.filter(m => !m.category || m.category === 'image').length
  const chat = aimodels.filter(m => m.category === 'chat').length
  return { image, chat }
}

// 查询余额
async function handleQueryBalance(id: number) {
  queryingBalanceIds.value.add(id)
  try {
    const result = await queryBalance(id)
    if (result.success) {
      toast.add({ title: '余额查询成功', color: 'success' })
    } else {
      toast.add({ title: '查询失败', description: result.error, color: 'error' })
    }
  } catch (error: any) {
    toast.add({
      title: '查询失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    queryingBalanceIds.value.delete(id)
  }
}

// 格式化配额（OneAPI quota 单位为 1/500000 元）
function formatQuota(quota?: number): string {
  if (quota === undefined || quota === null) return '未查询'
  const amount = quota / 500000
  if (amount >= 1000) {
    return `¥${(amount / 1000).toFixed(1)}K`
  }
  if (amount >= 1) {
    return `¥${amount.toFixed(2)}`
  }
  return `¥${amount.toFixed(4)}`
}

// 平台类型标签
const platformLabels: Record<string, string> = {
  oneapi: 'OneAPI',
  n1n: 'n1n',
  yunwu: '云雾',
}
</script>

<template>
  <SettingsLayout>
    <!-- 操作栏 -->
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-medium text-(--ui-text)">上游配置</h2>
      <UButton size="sm" @click="router.push('/settings/upstreams/new')">
        <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
        添加
      </UButton>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
    </div>

    <!-- 空状态 -->
    <div v-else-if="upstreams.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-cpu-chip" class="w-16 h-16 text-(--ui-text-dimmed)/50 mx-auto mb-4" />
      <p class="text-(--ui-text-muted) mb-4">还没有上游配置</p>
      <UButton @click="router.push('/settings/upstreams/new')">添加第一个配置</UButton>
    </div>

    <!-- 配置列表 -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="upstream in upstreams"
        :key="upstream.id"
        class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) hover:border-(--ui-border-accented) transition-colors cursor-pointer flex flex-col"
        @click="router.push(`/settings/upstreams/${upstream.id}`)"
      >
        <!-- 标题行 -->
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-(--ui-text) font-medium truncate min-w-0">{{ upstream.name }}</h3>
          <div class="flex gap-1 shrink-0" @click.stop>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              title="置顶"
              :loading="movingToTopIds.has(upstream.id)"
              @click="handleMoveToTop(upstream.id)"
            >
              <UIcon name="i-heroicons-arrow-up-circle" class="w-4 h-4" />
            </UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="router.push(`/settings/upstreams/${upstream.id}`)">
              <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
            </UButton>
          </div>
        </div>

        <!-- API 信息 -->
        <p class="text-(--ui-text-dimmed) text-sm truncate">{{ upstream.baseUrl }}</p>

        <!-- 模型数量统计 -->
        <div class="mt-3 flex flex-wrap gap-2">
          <span v-if="getModelCounts(upstream.aimodels).image > 0" class="text-xs px-2 py-1 rounded bg-(--ui-bg-muted) text-(--ui-text-muted)">
            🎨 {{ getModelCounts(upstream.aimodels).image }}
          </span>
          <span v-if="getModelCounts(upstream.aimodels).chat > 0" class="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
            💬 {{ getModelCounts(upstream.aimodels).chat }}
          </span>
        </div>

        <!-- 平台和余额信息（单行） -->
        <div class="mt-3 pt-3 border-t border-(--ui-border) flex items-center justify-between" @click.stop>
          <div class="flex items-center gap-2 text-sm">
            <template v-if="upstream.upstreamPlatform">
              <span class="text-(--ui-text-muted)">{{ platformLabels[upstream.upstreamPlatform] || upstream.upstreamPlatform }}</span>
              <span class="text-(--ui-text-dimmed)">·</span>
              <span class="text-(--ui-text)">{{ formatQuota(upstream.upstreamInfo?.quota) }}</span>
            </template>
            <span v-else class="text-(--ui-text-dimmed)">未配置平台</span>
          </div>
          <UButton
            v-if="upstream.upstreamPlatform"
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="queryingBalanceIds.has(upstream.id)"
            @click="handleQueryBalance(upstream.id)"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5" />
          </UButton>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

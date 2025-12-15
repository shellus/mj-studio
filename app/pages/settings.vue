<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

type ModelType = 'midjourney' | 'gemini'

const { configs, isLoading, loadConfigs, createConfig, updateConfig, deleteConfig } = useModelConfigs()
const toast = useToast()
const router = useRouter()

// 表单状态
const showForm = ref(false)
const editingConfig = ref<number | null>(null)
const form = ref({
  name: '',
  types: [] as ModelType[],
  baseUrl: '',
  apiKey: '',
  remark: '',
  isDefault: false,
})

// 模型类型选项
const typeOptions = [
  { value: 'midjourney' as ModelType, label: 'Midjourney', icon: 'i-heroicons-sparkles' },
  { value: 'gemini' as ModelType, label: 'Gemini', icon: 'i-heroicons-cpu-chip' },
]

// 切换模型类型选择
function toggleType(type: ModelType) {
  const index = form.value.types.indexOf(type)
  if (index >= 0) {
    form.value.types.splice(index, 1)
  } else {
    form.value.types.push(type)
  }
}

onMounted(() => {
  loadConfigs()
})

function openCreateForm() {
  editingConfig.value = null
  form.value = {
    name: '',
    types: ['midjourney'],
    baseUrl: '',
    apiKey: '',
    remark: '',
    isDefault: configs.value.length === 0,
  }
  showForm.value = true
}

function openEditForm(config: typeof configs.value[0]) {
  editingConfig.value = config.id
  form.value = {
    name: config.name,
    types: [...config.types],
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    remark: config.remark || '',
    isDefault: config.isDefault,
  }
  showForm.value = true
}

async function handleSubmit() {
  if (form.value.types.length === 0) {
    toast.add({ title: '请至少选择一种模型类型', color: 'error' })
    return
  }

  try {
    if (editingConfig.value) {
      await updateConfig(editingConfig.value, {
        ...form.value,
        remark: form.value.remark || null,
      })
      toast.add({ title: '配置已更新', color: 'success' })
    } else {
      await createConfig(form.value)
      toast.add({ title: '配置已创建', color: 'success' })
    }
    showForm.value = false
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

async function handleDelete(id: number) {
  if (!confirm('确定删除此配置？相关的任务记录将无法查看模型信息。')) return

  try {
    await deleteConfig(id)
    toast.add({ title: '配置已删除', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '删除失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

async function handleSetDefault(id: number) {
  try {
    await updateConfig(id, { isDefault: true })
    toast.add({ title: '已设为默认', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  }
}

// 格式化模型类型显示
function formatTypes(types: ModelType[]) {
  return types.map(t => t === 'midjourney' ? 'MJ' : 'Gemini').join(' / ')
}
</script>

<template>
  <div class="min-h-screen p-6">
    <div class="max-w-4xl mx-auto">
      <!-- 头部 -->
      <header class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white mb-1">模型配置</h1>
          <p class="text-white/60 text-sm">管理你的AI绘图服务配置</p>
        </div>
        <div class="flex gap-3">
          <UButton variant="ghost" color="neutral" @click="router.push('/')">
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
            返回
          </UButton>
          <UButton @click="openCreateForm">
            <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
            添加配置
          </UButton>
        </div>
      </header>

      <!-- 配置列表 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-white/40 animate-spin" />
      </div>

      <div v-else-if="configs.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-16 h-16 text-white/20 mx-auto mb-4" />
        <p class="text-white/60 mb-4">还没有模型配置</p>
        <UButton @click="openCreateForm">添加第一个配置</UButton>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="config in configs"
          :key="config.id"
          class="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-white font-medium">{{ config.name }}</h3>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                  {{ formatTypes(config.types) }}
                </span>
                <span
                  v-if="config.isDefault"
                  class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300"
                >
                  默认
                </span>
              </div>
              <p class="text-white/50 text-sm mb-1">{{ config.baseUrl }}</p>
              <p class="text-white/30 text-xs">API Key: {{ config.apiKey.slice(0, 8) }}...{{ config.apiKey.slice(-4) }}</p>
              <p v-if="config.remark" class="text-white/40 text-xs mt-2 italic">{{ config.remark }}</p>
            </div>

            <div class="flex gap-2">
              <UButton
                v-if="!config.isDefault"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="handleSetDefault(config.id)"
              >
                设为默认
              </UButton>
              <UButton size="xs" variant="ghost" color="neutral" @click="openEditForm(config)">
                <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
              </UButton>
              <UButton size="xs" variant="ghost" color="error" @click="handleDelete(config.id)">
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建/编辑表单 Modal -->
      <UModal v-model:open="showForm">
        <template #content>
          <div class="p-6">
            <h2 class="text-xl font-bold text-white mb-6">
              {{ editingConfig ? '编辑配置' : '添加配置' }}
            </h2>

            <form class="space-y-4" @submit.prevent="handleSubmit">
              <!-- 配置名称 -->
              <div>
                <label class="block text-white/70 text-sm mb-2">配置名称</label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="例如：我的MJ账号"
                  class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <!-- 模型类型（多选） -->
              <div>
                <label class="block text-white/70 text-sm mb-2">支持的模型类型（可多选）</label>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="opt in typeOptions"
                    :key="opt.value"
                    type="button"
                    :class="[
                      'p-3 rounded-lg border-2 transition-all text-center flex items-center justify-center gap-2',
                      form.types.includes(opt.value)
                        ? 'border-purple-400 bg-purple-500/10 text-white'
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    ]"
                    @click="toggleType(opt.value)"
                  >
                    <UIcon :name="opt.icon" class="w-5 h-5" />
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <!-- API地址 -->
              <div>
                <label class="block text-white/70 text-sm mb-2">API地址</label>
                <input
                  v-model="form.baseUrl"
                  type="url"
                  placeholder="https://api.example.com"
                  class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <!-- API密钥 -->
              <div>
                <label class="block text-white/70 text-sm mb-2">API密钥</label>
                <input
                  v-model="form.apiKey"
                  type="password"
                  placeholder="sk-xxx..."
                  class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <!-- 备注 -->
              <div>
                <label class="block text-white/70 text-sm mb-2">备注（可选）</label>
                <textarea
                  v-model="form.remark"
                  placeholder="添加一些说明..."
                  rows="2"
                  class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              <!-- 设为默认 -->
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="form.isDefault"
                  type="checkbox"
                  class="w-5 h-5 rounded bg-white/5 border-white/20 text-purple-500 focus:ring-purple-400"
                />
                <span class="text-white/70">设为默认配置</span>
              </label>

              <!-- 提交按钮 -->
              <div class="flex gap-3 pt-4">
                <UButton type="submit" class="flex-1">
                  {{ editingConfig ? '保存' : '创建' }}
                </UButton>
                <UButton type="button" variant="outline" color="neutral" class="flex-1 border-white/20 text-white/70 hover:bg-white/10" @click="showForm = false">
                  取消
                </UButton>
              </div>
            </form>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

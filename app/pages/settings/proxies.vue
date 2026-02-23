<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const toast = useToast()
const { proxies, loadProxies, createProxy, updateProxy, deleteProxy } = useProxies()

// 模态框状态
const showEditModal = ref(false)
const editingProxy = ref<{ id?: number; name: string; url: string } | null>(null)
const isSaving = ref(false)

function openAddModal() {
  editingProxy.value = { name: '', url: '' }
  showEditModal.value = true
}

function openEditModal(proxy: { id: number; name: string; url: string }) {
  editingProxy.value = { ...proxy }
  showEditModal.value = true
}

async function handleSave() {
  if (!editingProxy.value) return
  const { name, url } = editingProxy.value
  if (!name.trim() || !url.trim()) {
    toast.add({ title: '名称和地址不能为空', color: 'error' })
    return
  }
  isSaving.value = true
  try {
    if (editingProxy.value.id) {
      await updateProxy(editingProxy.value.id, { name: name.trim(), url: url.trim() })
      toast.add({ title: '代理已更新', color: 'success' })
    } else {
      await createProxy({ name: name.trim(), url: url.trim() })
      toast.add({ title: '代理已添加', color: 'success' })
    }
    showEditModal.value = false
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '操作失败'
    toast.add({ title: '操作失败', description: message, color: 'error' })
  } finally {
    isSaving.value = false
  }
}

const showDeleteConfirm = ref(false)
const deletingId = ref<number | null>(null)

function confirmDelete(id: number) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  showDeleteConfirm.value = false
  try {
    await deleteProxy(deletingId.value)
    toast.add({ title: '代理已删除', color: 'success' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败'
    toast.add({ title: '删除失败', description: message, color: 'error' })
  }
}

onMounted(() => {
  loadProxies()
})
</script>

<template>
  <SettingsLayout>
    <div class="mb-8">
      <div class="mb-4">
        <h2 class="text-lg font-medium text-(--ui-text)">代理配置</h2>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          管理网络代理，可在上游配置中关联使用
        </p>
      </div>

      <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-medium text-(--ui-text)">代理列表</h3>
          <UButton icon="i-heroicons-plus" @click="openAddModal">
            添加代理
          </UButton>
        </div>

        <div class="space-y-2">
          <div
            v-for="proxy in proxies"
            :key="proxy.id"
            class="flex items-center justify-between p-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border)"
          >
            <div>
              <span class="text-sm font-medium text-(--ui-text)">{{ proxy.name }}</span>
              <span class="text-xs text-(--ui-text-muted) ml-2">{{ proxy.url }}</span>
            </div>
            <div class="flex gap-1">
              <UButton size="xs" variant="ghost" icon="i-heroicons-pencil" @click="openEditModal(proxy)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-heroicons-trash" @click="confirmDelete(proxy.id)" />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="proxies.length === 0" class="text-center py-8 text-(--ui-text-muted)">
            <UIcon name="i-heroicons-globe-alt" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无代理配置</p>
            <p class="text-sm mt-1">添加代理后，可在上游配置中关联使用</p>
          </div>
        </div>
      </div>

      <!-- 代理编辑弹窗 -->
      <UModal v-model:open="showEditModal" :title="editingProxy?.id ? '编辑代理' : '添加代理'">
        <template #body>
          <div class="space-y-4">
            <UFormField label="名称">
              <UInput v-model="editingProxy!.name" placeholder="例如：本地代理" class="w-full" />
            </UFormField>
            <UFormField label="地址">
              <UInput v-model="editingProxy!.url" placeholder="http://127.0.0.1:8080" class="w-full" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="outline" color="neutral" @click="showEditModal = false">取消</UButton>
            <UButton :loading="isSaving" @click="handleSave">保存</UButton>
          </div>
        </template>
      </UModal>

      <!-- 删除确认弹窗 -->
      <UModal v-model:open="showDeleteConfirm" title="确认删除" description="删除代理后，关联的上游将取消代理配置。" :close="false">
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="error" @click="handleDelete">删除</UButton>
            <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
          </div>
        </template>
      </UModal>
    </div>
  </SettingsLayout>
</template>

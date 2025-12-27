<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { updateUser } = useAuth()
const toast = useToast()

// 用户数据
const isLoading = ref(true)
const isSaving = ref(false)
const currentEmail = ref('')

const formData = reactive({
  name: '',
  avatar: '',
})

// 修改密码相关
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const isChangingPassword = ref(false)

// 修改邮箱相关
const emailForm = reactive({
  newEmail: '',
  password: '',
})
const isChangingEmail = ref(false)

// 加载用户信息
async function loadUser() {
  isLoading.value = true
  try {
    const userData = await $fetch('/api/user')
    formData.name = userData.name || ''
    formData.avatar = userData.avatar || ''
    currentEmail.value = userData.email || ''
  } catch (error: any) {
    toast.add({
      title: '加载失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadUser()
})

// 处理头像上传
async function handleAvatarUpload(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 限制大小 2MB
  if (file.size > 2 * 1024 * 1024) {
    toast.add({ title: '图片大小不能超过 2MB', color: 'error' })
    return
  }

  // 转换为 base64
  const reader = new FileReader()
  reader.onload = () => {
    formData.avatar = reader.result as string
  }
  reader.readAsDataURL(file)
}

// 清除头像
function clearAvatar() {
  formData.avatar = ''
}

// 保存个人信息
async function saveProfile() {
  isSaving.value = true
  try {
    await $fetch('/api/user', {
      method: 'PUT',
      body: {
        name: formData.name?.trim() || null,
        avatar: formData.avatar || null,
      },
    })
    // 更新全局用户状态，让导航栏同步更新
    updateUser({
      name: formData.name?.trim() || null,
      avatar: formData.avatar || null,
    })
    toast.add({ title: '个人信息已保存', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '保存失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}

// 修改密码
async function changePassword() {
  if (!passwordForm.currentPassword || !passwordForm.newPassword) {
    toast.add({ title: '请填写当前密码和新密码', color: 'error' })
    return
  }

  if (passwordForm.newPassword.length < 6) {
    toast.add({ title: '新密码长度不能少于6位', color: 'error' })
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.add({ title: '两次输入的新密码不一致', color: 'error' })
    return
  }

  isChangingPassword.value = true
  try {
    await $fetch('/api/user/password', {
      method: 'PUT',
      body: {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      },
    })

    toast.add({ title: '密码修改成功', color: 'success' })
    // 清空表单
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } catch (error: any) {
    toast.add({ title: '修改失败', description: error.data?.message || error.message, color: 'error' })
  } finally {
    isChangingPassword.value = false
  }
}

// 修改邮箱
async function changeEmail() {
  if (!emailForm.newEmail || !emailForm.password) {
    toast.add({ title: '请填写新邮箱和密码', color: 'error' })
    return
  }

  isChangingEmail.value = true
  try {
    const result = await $fetch<{ email: string }>('/api/user/email', {
      method: 'PUT',
      body: {
        newEmail: emailForm.newEmail,
        password: emailForm.password,
      },
    })

    // 更新本地用户信息和当前显示
    updateUser({ email: result.email })
    currentEmail.value = result.email

    toast.add({ title: '邮箱修改成功', color: 'success' })
    // 清空表单
    emailForm.newEmail = ''
    emailForm.password = ''
  } catch (error: any) {
    toast.add({ title: '修改失败', description: error.data?.message || error.message, color: 'error' })
  } finally {
    isChangingEmail.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="max-w-2xl mx-auto">
      <!-- 页面标题 -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-(--ui-text)">用户设置</h1>
        <p class="text-(--ui-text-muted) text-sm mt-1">管理你的个人信息和偏好设置</p>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <!-- 设置内容 -->
      <div v-if="!isLoading" class="space-y-6">
        <!-- 个人信息卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">个人信息</h2>

          <!-- 头像 -->
          <UFormField label="头像" name="avatar">
            <div class="flex items-center gap-4">
              <div class="relative w-20 h-20 rounded-full overflow-hidden group">
                <img
                  v-if="formData.avatar"
                  :src="formData.avatar"
                  class="w-full h-full object-cover"
                />
                <label
                  v-else
                  class="w-full h-full border-2 border-dashed border-(--ui-border-accented) hover:border-(--ui-primary) transition-colors flex flex-col items-center justify-center cursor-pointer rounded-full bg-(--ui-bg-muted)"
                >
                  <UIcon name="i-heroicons-user" class="w-8 h-8 text-(--ui-text-dimmed)" />
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleAvatarUpload"
                  />
                </label>
                <!-- 已有头像时的删除遮罩 -->
                <button
                  v-if="formData.avatar"
                  type="button"
                  class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full"
                  @click="clearAvatar"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
                </button>
              </div>
              <div class="text-sm text-(--ui-text-muted)">
                <p>点击上传头像</p>
                <p class="text-xs">支持 JPG、PNG，最大 2MB</p>
              </div>
            </div>
          </UFormField>

          <!-- 昵称 -->
          <UFormField label="昵称" name="name">
            <UInput
              v-model="formData.name"
              placeholder="输入你的昵称"
              class="w-full max-w-xs"
            />
          </UFormField>

          <div class="flex justify-end">
            <UButton :loading="isSaving" @click="saveProfile">
              保存
            </UButton>
          </div>
        </div>

        <!-- 修改邮箱 -->
        <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">修改邮箱</h2>
          <p class="text-sm text-(--ui-text-muted)">当前邮箱：{{ currentEmail }}</p>

          <UFormField label="新邮箱" name="newEmail">
            <UInput
              v-model="emailForm.newEmail"
              type="email"
              placeholder="输入新邮箱地址"
              class="w-full max-w-xs"
            />
          </UFormField>
          <UFormField label="确认密码" name="emailPassword">
            <UInput
              v-model="emailForm.password"
              type="password"
              placeholder="输入当前密码以确认身份"
              class="w-full max-w-xs"
            />
          </UFormField>
          <div class="flex justify-end">
            <UButton :loading="isChangingEmail" @click="changeEmail">
              修改邮箱
            </UButton>
          </div>
        </div>

        <!-- 修改密码 -->
        <div class="bg-(--ui-bg-elevated) rounded-xl p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">修改密码</h2>

          <UFormField label="当前密码" name="currentPassword">
            <UInput
              v-model="passwordForm.currentPassword"
              type="password"
              placeholder="输入当前密码"
              class="w-full max-w-xs"
            />
          </UFormField>
          <UFormField label="新密码" name="newPassword">
            <UInput
              v-model="passwordForm.newPassword"
              type="password"
              placeholder="输入新密码（至少6位）"
              class="w-full max-w-xs"
            />
          </UFormField>
          <UFormField label="确认新密码" name="confirmPassword">
            <UInput
              v-model="passwordForm.confirmPassword"
              type="password"
              placeholder="再次输入新密码"
              class="w-full max-w-xs"
            />
          </UFormField>
          <div class="flex justify-end">
            <UButton :loading="isChangingPassword" @click="changePassword">
              修改密码
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

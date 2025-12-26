<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()

onMounted(() => {
  router.replace('/settings/upstreams')
})
</script>

<template>
  <div class="p-6 text-center">
    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
  </div>
</template>

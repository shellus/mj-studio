<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})
</script>

<template>
  <div class="p-6">
    <div class="max-w-7xl mx-auto">
      <StudioTrash />
    </div>
  </div>
</template>

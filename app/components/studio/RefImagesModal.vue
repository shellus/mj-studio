<script setup lang="ts">
defineProps<{
  images: string[]
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <UModal v-model:open="open" title="参考图" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="grid gap-4" :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
        <div
          v-for="(img, index) in images"
          :key="index"
          class="relative bg-(--ui-bg-muted) rounded-lg overflow-hidden"
        >
          <img
            :src="img"
            :alt="`参考图 ${index + 1}`"
            class="w-full h-auto max-h-[60vh] object-contain"
          />
          <div class="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs text-white">
            {{ index + 1 }} / {{ images.length }}
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{
  color?: string
}>()
</script>

<template>
  <div class="bars-loader flex items-end justify-center gap-0.5">
    <span class="bar" :class="color || 'bg-current'" />
    <span class="bar" :class="color || 'bg-current'" />
    <span class="bar" :class="color || 'bg-current'" />
    <span class="bar" :class="color || 'bg-current'" />
  </div>
</template>

<style scoped>
.bars-loader {
  height: 1em;
}

.bar {
  width: 3px;
  border-radius: 1px;
  animation: bars 1s ease-in-out infinite;
}

.bar:nth-child(1) { animation-delay: 0s; }
.bar:nth-child(2) { animation-delay: 0.15s; }
.bar:nth-child(3) { animation-delay: 0.3s; }
.bar:nth-child(4) { animation-delay: 0.45s; }

@keyframes bars {
  0%, 100% {
    height: 20%;
  }
  50% {
    height: 100%;
  }
}
</style>

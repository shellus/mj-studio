<script setup lang="ts">
import { formatTimeAgo, formatDateTime } from '~/composables/useTimeFormat'

const props = defineProps<{
  time: string
}>()

const showFull = ref(false)

const relativeTime = computed(() => formatTimeAgo(props.time))
const fullTime = computed(() => formatDateTime(props.time))

function toggle() {
  showFull.value = !showFull.value
}
</script>

<template>
  <span
    class="cursor-pointer"
    :title="fullTime"
    @click.stop="toggle"
  >
    {{ showFull ? fullTime : relativeTime }}
  </span>
</template>

// 响应式媒体查询 composable
export function useMediaQuery(query: string) {
  const matches = ref(false)

  if (import.meta.client) {
    const mediaQuery = window.matchMedia(query)
    matches.value = mediaQuery.matches

    // 监听变化
    const handler = (e: MediaQueryListEvent) => {
      matches.value = e.matches
    }

    mediaQuery.addEventListener('change', handler)

    onUnmounted(() => {
      mediaQuery.removeEventListener('change', handler)
    })
  }

  return matches
}

// 常用断点
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)')
}

const STORAGE_KEY = 'chat-sidebar-state'

interface SidebarState {
  left: { collapsed: boolean; width: number }
  right: { collapsed: boolean; width: number }
}

const DEFAULT_STATE: SidebarState = {
  left: { collapsed: false, width: 300 },
  right: { collapsed: false, width: 310 }
}

const MIN_WIDTH = 200
const MAX_WIDTH = 500

// 全局状态（跨组件共享）
const state = ref<SidebarState | null>(null)

function loadState(): SidebarState {
  if (import.meta.server) return DEFAULT_STATE
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as SidebarState
      return {
        left: { ...DEFAULT_STATE.left, ...parsed.left },
        right: { ...DEFAULT_STATE.right, ...parsed.right }
      }
    }
  } catch {}
  return DEFAULT_STATE
}

function saveState(newState: SidebarState) {
  if (import.meta.server) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState))
  } catch {}
}

export function useSidebarState() {
  // 初始化状态
  if (!state.value) {
    state.value = loadState()
  }

  const leftCollapsed = computed(() => state.value?.left.collapsed ?? false)
  const rightCollapsed = computed(() => state.value?.right.collapsed ?? false)
  const leftWidth = computed(() => state.value?.left.width ?? DEFAULT_STATE.left.width)
  const rightWidth = computed(() => state.value?.right.width ?? DEFAULT_STATE.right.width)

  function toggleLeft() {
    if (!state.value) return
    state.value.left.collapsed = !state.value.left.collapsed
    saveState(state.value)
  }

  function toggleRight() {
    if (!state.value) return
    state.value.right.collapsed = !state.value.right.collapsed
    saveState(state.value)
  }

  function setLeftWidth(width: number) {
    if (!state.value) return
    state.value.left.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
    saveState(state.value)
  }

  function setRightWidth(width: number) {
    if (!state.value) return
    state.value.right.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
    saveState(state.value)
  }

  return {
    leftCollapsed,
    rightCollapsed,
    leftWidth,
    rightWidth,
    toggleLeft,
    toggleRight,
    setLeftWidth,
    setRightWidth,
    MIN_WIDTH,
    MAX_WIDTH
  }
}

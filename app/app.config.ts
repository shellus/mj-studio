export default defineAppConfig({
  ui: {
    // 主色调
    colors: {
      primary: 'violet',
      secondary: 'blue',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      neutral: 'zinc',
    },
    // Modal 遮罩背景改为深色
    modal: {
      slots: {
        overlay: 'bg-black/70 backdrop-blur-sm',
      },
    },
  },
})

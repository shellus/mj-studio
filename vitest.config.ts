import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const projectRoot = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~~': projectRoot,
      '@@': projectRoot,
    },
  },
  test: {
    environment: 'node',
    testTimeout: 180000, // 绘图任务需要较长时间
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.worktrees/**',
    ],
  },
})

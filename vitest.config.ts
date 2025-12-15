import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120000, // MJ 生图需要较长时间
  },
})

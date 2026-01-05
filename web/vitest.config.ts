import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/composables/useMjpeg.ts', 'src/utils/mjpegStreamParser.ts'],
    },
  },
})

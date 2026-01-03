import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  // @ts-expect-error - Vite 7 和 @vitejs/plugin-vue 6 类型定义不完全兼容，但运行时正常
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:20242',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:20242',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
})

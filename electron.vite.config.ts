import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: resolve('src/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src')
      }
    },
    plugins: [vue()]
  }
})

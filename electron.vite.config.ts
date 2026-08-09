import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

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
    // 版本号从 package.json 注入，避免界面里手写版本号后忘记同步
    // （曾长期显示 v1.0.18 而实际已是 1.0.37，用户照此提 issue 会误导排查）
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
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

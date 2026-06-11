import { createApp } from 'vue'
import { createPinia } from 'pinia'
import dayjs from 'dayjs'
import isToday from 'dayjs/plugin/isToday'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import 'highlight.js/styles/github.css'

dayjs.extend(isToday)

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Global Vue component error handler — catches errors thrown inside setup/render/lifecycle hooks
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue error]', info, err)
  // Dynamically import to avoid circular dep at module init time
  import('./stores/toast').then(({ useToastStore }) => {
    useToastStore().error(`界面错误：${(err as Error)?.message ?? String(err)}`)
  })
}

// Catch unhandled JS errors and promise rejections
window.onerror = (_msg, _src, _line, _col, err) => {
  console.error('[Unhandled error]', err)
}
window.onunhandledrejection = (e) => {
  // Suppress AbortError — those are intentional (agent abort)
  if ((e.reason as Error)?.name === 'AbortError') return
  console.error('[Unhandled rejection]', e.reason)
  import('./stores/toast').then(({ useToastStore }) => {
    useToastStore().error(`未处理的错误：${(e.reason as Error)?.message ?? String(e.reason)}`)
  })
}

app.mount('#app')

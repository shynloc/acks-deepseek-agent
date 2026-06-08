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
app.mount('#app')

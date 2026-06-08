import { createRouter, createWebHashHistory } from 'vue-router'
import AIChat from '@/views/AIChat.vue'
import Notebook from '@/views/Notebook.vue'
import Profile from '@/views/Profile.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: AIChat, name: 'ai-chat' },
    { path: '/notebook', component: Notebook, name: 'notebook' },
    { path: '/profile', component: Profile, name: 'profile' }
  ]
})

export default router

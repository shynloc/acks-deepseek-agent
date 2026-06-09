<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Sun, Moon, MessageSquare, BookOpen, User } from '@lucide/vue'
import { useUIStore } from '@/stores/ui'
import iconDark from '@/assets/icons/icon-dark.png'
import iconLight from '@/assets/icons/icon-light.png'

const router = useRouter()
const route = useRoute()
const uiStore = useUIStore()

// macOS 交通灯占据左侧约 80px（x=16 + 3×按钮 + 间距）
const isMac = navigator.platform.toUpperCase().includes('MAC')

const tabs = [
  { label: 'AI 笔记', path: '/', icon: MessageSquare },
  { label: '笔记本', path: '/notebook', icon: BookOpen },
  { label: '个人中心', path: '/profile', icon: User }
]

function isActive(path: string): boolean {
  return route.path === path
}

const appIcon = computed(() => uiStore.isDark ? iconDark : iconLight)
</script>

<template>
  <header
    class="grid grid-cols-[1fr_auto_1fr] items-center h-14 border-b border-zinc-200 dark:border-zinc-800
           bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-sm flex-none select-none
           transition-colors duration-200 pr-4"
    :class="isMac ? 'pl-[84px]' : 'pl-4'"
    style="-webkit-app-region: drag"
  >
    <!-- Left: Logo + Name -->
    <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
      <img :src="appIcon" class="w-7 h-7 flex-none" alt="DeepSeek Notes" draggable="false" />
      <span class="font-semibold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
        DeepSeek Notes
      </span>
    </div>

    <!-- Center: Tabs (always exactly centered) -->
    <nav class="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1" style="-webkit-app-region: no-drag">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        @click="router.push(tab.path)"
        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
        :class="isActive(tab.path)
          ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'"
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        {{ tab.label }}
      </button>
    </nav>

    <!-- Right: Controls -->
    <div class="flex items-center justify-end gap-2" style="-webkit-app-region: no-drag">
      <button
        @click="uiStore.toggleTheme()"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400
               hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200
               transition-all duration-150"
        :title="uiStore.isDark ? '切换浅色模式' : '切换深色模式'"
      >
        <Sun v-if="uiStore.isDark" class="w-4 h-4" />
        <Moon v-else class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
